"""
character_test.py
-----------------
Run 1 agent through all 22 USEFUL_CONFIGS at a single infection level.
Used to inspect raw LLM responses for:
  - 4th wall breaks (model thinks it's an AI, not a person)
  - Refusals ("As a language model I cannot...")
  - Format failures
  - Character consistency across providers

Usage:
    python character_test.py                    # agent 0, 3.0% infection
    python character_test.py --agent 5          # agent 5
    python character_test.py --level 1.5        # different infection level
    python character_test.py --dry-run          # show plan only

Saves results to data/character_tests/ and generates site/character_test.html.

DO NOT RUN WITHOUT USER APPROVAL — makes real API calls (~$0.05).
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "GABM-Epidemic"))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "GABM-Epidemic" / ".env")
from providers import create_provider, calculate_cost

USEFUL_CONFIGS = [
    ("anthropic", "claude-opus-4-5",          "off"),
    ("anthropic", "claude-sonnet-4-5",         "off"),
    ("anthropic", "claude-haiku-4-5",          "off"),
    ("anthropic", "claude-sonnet-4-0",         "off"),
    ("anthropic", "claude-3-haiku-20240307",   "off"),
    ("openai",    "gpt-5.2",                   "off"),
    ("openai",    "gpt-5.2",                   "low"),
    ("openai",    "gpt-5.2",                   "medium"),
    ("openai",    "gpt-5.2",                   "high"),
    ("openai",    "gpt-5.1",                   "off"),
    ("openai",    "gpt-5.1",                   "high"),
    ("openai",    "gpt-4.1",                   "off"),
    ("openai",    "gpt-4o",                    "off"),
    ("openai",    "gpt-3.5-turbo",             "off"),
    ("openai",    "o3",                        "required"),
    ("gemini",    "gemini-3-flash-preview",    "off"),
    ("gemini",    "gemini-3-flash-preview",    "low"),
    ("gemini",    "gemini-3-flash-preview",    "medium"),
    ("gemini",    "gemini-3-flash-preview",    "high"),
    ("gemini",    "gemini-2.5-flash-lite",     "off"),
    ("gemini",    "gemini-2.5-flash",          "off"),
    ("gemini",    "gemini-2.0-flash",          "off"),
]

# 4th wall break detection patterns
FOURTHWALL_PATTERNS = [
    "as an ai", "as a language model", "as an llm", "i'm an ai",
    "i am an ai", "i'm a chatbot", "i cannot rolep", "i'm not able to",
    "i am not able to", "i cannot assist", "i'm unable to",
    "artificial intelligence", "language model", "i don't have personal",
    "i don't have feelings", "i don't experience", "i cannot experience",
    "as a virtual", "i'm just an", "i am just an",
]

REFUSAL_PATTERNS = [
    "i cannot assist", "i'm unable to", "i am unable to",
    "i won't", "i will not", "i refuse", "i can't help",
    "i cannot help", "inappropriate", "i must decline",
]


def build_prompt(agent: dict, infection_pct: float) -> str:
    return f"""You are {agent['name']}. You are {agent['age']} years old.
You are a person who is {agent['traits_str']}.
You live in the town of Dewberry Hollow. You have a job and go to the office for work every day.
You feel healthy and well.
You know about the Catasat virus spreading across the country. It is an airborne virus causing an infectious disease that spreads from human to human. The deadliness of the virus is unknown.
You check the newspaper and find that {infection_pct:.1f}% of Dewberry Hollow's population were diagnosed with new infections of the Catasat virus yesterday.
Should you stay at home for the entire day? Please provide your reasoning.

If the answer is "Yes", please state your reasoning as "Reasoning: [explanation]."
If the answer is "No", please state your reasoning as "Reasoning: [explanation]."

The format should be as follows:
Reasoning:
Response:

Example:
Reasoning: You are tired.
Response: Yes

You have to provide Response in a single word; it must be either "Yes" or "No"."""


def parse_response(text: str):
    reasoning, response, format_valid = "", "", True
    try:
        if "Reasoning:" in text:
            parts = text.split("Reasoning:", 1)[1]
            if "Response:" in parts:
                reasoning = parts.split("Response:", 1)[0].strip()
                response_raw = parts.split("Response:", 1)[1].strip().split()[0]
                response = response_raw.rstrip(".,;").lower()
            else:
                format_valid = False
        else:
            format_valid = False
        if response not in ("yes", "no"):
            format_valid = False
            response = ""
    except Exception:
        format_valid = False
    return response, reasoning, format_valid


def detect_flags(full_text: str):
    t = full_text.lower()
    fourth_wall = any(p in t for p in FOURTHWALL_PATTERNS)
    refusal = any(p in t for p in REFUSAL_PATTERNS)
    flags = []
    if fourth_wall:
        flags.append("4th-wall")
    if refusal:
        flags.append("refusal")
    return flags


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent",   type=int,   default=0,   help="Agent index (0-99)")
    parser.add_argument("--level",   type=float, default=3.0, help="Infection level default 3.0")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    agents_path = Path(__file__).parent / "agents" / "agents.json"
    with open(agents_path) as f:
        agents = json.load(f)
    agent = agents[args.agent]

    print(f"Agent: #{agent['agent_id']} {agent['name']}, age {agent['age']}")
    print(f"Traits: {agent['traits_str']}")
    print(f"Infection level: {args.level:.1f}%")
    print(f"Configs: {len(USEFUL_CONFIGS)}")
    print()

    if args.dry_run:
        print("[DRY RUN]\n")
        for p, m, r in USEFUL_CONFIGS:
            print(f"  {p:10s} {m:35s} [{r}]")
        return

    prompt = build_prompt(agent, args.level)
    messages = [{"role": "user", "content": prompt}]
    results = []
    total_cost = 0.0

    for i, (provider_name, model, reasoning) in enumerate(USEFUL_CONFIGS, 1):
        label = f"{provider_name}/{model} [{reasoning}]"
        print(f"[{i:2d}/{len(USEFUL_CONFIGS)}] {label}...", end=" ", flush=True)
        t0 = time.time()
        try:
            provider = create_provider(provider_name, model, reasoning=reasoning, max_retries=2)
            result = provider.get_completion(messages, temperature=0)
            latency = round(time.time() - t0, 2)
            text = result.text or ""
            usage = result.usage
            cost = calculate_cost(provider_name, model,
                                  usage.input_tokens, usage.output_tokens,
                                  reasoning_tokens=usage.reasoning_tokens)
            total_cost += cost
            response, reasoning_text, format_valid = parse_response(text)
            flags = detect_flags(text)
            flag_str = " ⚑ " + ",".join(flags) if flags else ""
            print(f"{'YES' if response=='yes' else 'NO ' if response=='no' else '???'} "
                  f"${cost:.5f} {latency:.1f}s{flag_str}")
            results.append({
                "provider": provider_name, "model": model, "reasoning": reasoning,
                "response": response, "reasoning_text": reasoning_text,
                "full_text": text, "format_valid": format_valid, "flags": flags,
                "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
                "reasoning_tokens": usage.reasoning_tokens,
                "cost": round(cost, 7), "latency": latency, "error": None,
            })
        except Exception as e:
            latency = round(time.time() - t0, 2)
            print(f"ERROR: {str(e)[:60]}")
            results.append({
                "provider": provider_name, "model": model, "reasoning": reasoning,
                "response": "", "reasoning_text": "", "full_text": "", "format_valid": False,
                "flags": ["error"], "input_tokens": 0, "output_tokens": 0,
                "reasoning_tokens": 0, "cost": 0, "latency": latency,
                "error": str(e)[:200],
            })

    print(f"\nTotal cost: ${total_cost:.5f}")

    # Save JSON
    out_dir = Path(__file__).parent / "data" / "character_tests"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = out_dir / f"chartest_{ts}.json"
    payload = {
        "agent": agent, "infection_level": args.level,
        "timestamp": ts, "total_cost": round(total_cost, 6),
        "results": results,
    }
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Saved: {json_path}")

    # Generate HTML
    html_path = Path(__file__).parent / "site" / "character_test.html"
    write_html(html_path, payload)
    print(f"HTML: {html_path}")
    print(f"\nOpen: http://localhost:8000/site/character_test.html")


def write_html(path: Path, data: dict):
    agent = data["agent"]
    level = data["infection_level"]
    ts = data["timestamp"]
    results = data["results"]

    n_yes = sum(1 for r in results if r["response"] == "yes")
    n_no  = sum(1 for r in results if r["response"] == "no")
    n_fmt = sum(1 for r in results if not r["format_valid"])
    flagged = [r for r in results if r["flags"] and r["flags"] != ["error"]]

    def card(r):
        prov_cls = {"anthropic": "anth", "openai": "oai", "gemini": "gem"}.get(r["provider"], "")
        resp = r["response"].upper() if r["response"] else "???"
        resp_color = "#4ade80" if r["response"] == "no" else "#f87171" if r["response"] == "yes" else "#fbbf24"
        flags_html = "".join(
            f'<span class="flag flag-{f.replace("-","")}">{f}</span>' for f in r["flags"]
        )
        tokens_note = ""
        if r["reasoning_tokens"]:
            tokens_note = f'<span class="think-note">+{r["reasoning_tokens"]:,} thinking</span>'
        err_block = f'<div class="error-block">{r["error"]}</div>' if r.get("error") else ""
        reasoning_html = r["reasoning_text"].replace("<", "&lt;").replace(">", "&gt;") if r["reasoning_text"] else ""
        full_html = r["full_text"].replace("<", "&lt;").replace(">", "&gt;") if not r["format_valid"] and r["full_text"] else ""
        raw_block = f'<details class="raw"><summary>Raw output</summary><pre>{full_html}</pre></details>' if full_html else ""
        return f"""
<div class="card prov-{prov_cls}">
  <div class="card-hdr">
    <span class="prov-badge prov-{prov_cls}">{r["provider"]}</span>
    <span class="model-name">{r["model"]}</span>
    <span class="reasoning-badge rsn-{r["reasoning"]}">{r["reasoning"]}</span>
    {flags_html}
    <span class="response-badge" style="color:{resp_color}">{resp}</span>
    <span class="meta">${r["cost"]:.5f} · {r["latency"]:.1f}s · {r["input_tokens"]}in/{r["output_tokens"]}out {tokens_note}</span>
  </div>
  {err_block}
  <div class="reasoning">{reasoning_html}</div>
  {raw_block}
</div>"""

    cards_html = "\n".join(card(r) for r in results)

    flagged_summary = ""
    if flagged:
        items = "".join(f"<li><strong>{r['model']} [{r['reasoning']}]</strong>: {', '.join(r['flags'])}</li>" for r in flagged)
        flagged_summary = f'<div class="alert"><strong>⚑ Flagged responses ({len(flagged)}):</strong><ul>{items}</ul></div>'
    else:
        flagged_summary = '<div class="alert ok">✓ No 4th-wall breaks or refusals detected across all configs.</div>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Character Test — {agent['name']} @ {level:.1f}%</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e0e0e0; padding: 24px; max-width: 960px; margin: 0 auto; }}
h1 {{ font-size: 1.3rem; font-weight: 600; margin-bottom: 4px; }}
.subtitle {{ color: #888; font-size: 0.82rem; margin-bottom: 20px; }}
.nav {{ display: flex; gap: 12px; margin-bottom: 20px; }}
.nav a {{ color: #60a5fa; font-size: 0.82rem; text-decoration: none; }}
.summary {{ display: flex; gap: 20px; flex-wrap: wrap; background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }}
.stat {{ font-size: 0.82rem; }}
.stat label {{ color: #888; display: block; margin-bottom: 2px; }}
.stat value {{ font-weight: 700; font-size: 1.1rem; font-family: monospace; }}
.prompt-box {{ background: #141720; border: 1px solid #2a2d3a; border-radius: 6px; padding: 14px; margin-bottom: 20px; font-size: 0.78rem; color: #aaa; white-space: pre-wrap; font-family: monospace; line-height: 1.5; }}
.agent-line {{ color: #f0f0f0; font-weight: 600; }}

.alert {{ background: #1a0d0d; border-left: 3px solid #f87171; border-radius: 0 6px 6px 0; padding: 10px 14px; margin-bottom: 20px; font-size: 0.82rem; }}
.alert ul {{ margin: 6px 0 0 16px; font-size: 0.78rem; color: #ccc; }}
.alert.ok {{ background: #0d1a10; border-left-color: #4ade80; }}

.card {{ background: #141720; border: 1px solid #1e2130; border-radius: 8px; padding: 14px; margin-bottom: 12px; }}
.card.prov-anth {{ border-left: 3px solid #7c3aed; }}
.card.prov-oai  {{ border-left: 3px solid #16a34a; }}
.card.prov-gem  {{ border-left: 3px solid #2563eb; }}
.card-hdr {{ display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }}
.prov-badge {{ padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; }}
.prov-anth {{ background: #2a1a3a; color: #c084fc; }}
.prov-oai  {{ background: #1a3a2a; color: #4ade80; }}
.prov-gem  {{ background: #1a2a3a; color: #60a5fa; }}
.model-name {{ font-size: 0.82rem; font-weight: 600; font-family: monospace; }}
.reasoning-badge {{ font-size: 0.70rem; padding: 1px 6px; border-radius: 3px; background: #1e2130; color: #666; }}
.rsn-high   {{ background: #1a1000; color: #fbbf24; }}
.rsn-medium {{ background: #1a1200; color: #d97706; }}
.rsn-low    {{ background: #151800; color: #a3a316; }}
.rsn-required {{ background: #1a0a1a; color: #d8b4fe; }}
.response-badge {{ font-size: 0.95rem; font-weight: 800; margin-left: auto; }}
.meta {{ font-size: 0.72rem; color: #555; white-space: nowrap; }}
.think-note {{ color: #60a5fa; margin-left: 4px; }}
.flag {{ font-size: 0.68rem; padding: 2px 7px; border-radius: 3px; font-weight: 700; }}
.flag-4thwall {{ background: #2a0a0a; color: #f87171; }}
.flag-refusal {{ background: #2a1a00; color: #fb923c; }}
.flag-error   {{ background: #1a1a1a; color: #888; }}
.reasoning {{ font-size: 0.80rem; color: #ccc; line-height: 1.6; padding: 4px 0; white-space: pre-wrap; }}
.error-block {{ background: #1a0808; color: #f87171; font-size: 0.75rem; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-family: monospace; }}
details.raw summary {{ font-size: 0.72rem; color: #555; cursor: pointer; margin-top: 8px; }}
details.raw pre {{ font-size: 0.72rem; color: #888; margin-top: 6px; white-space: pre-wrap; background: #0a0c12; padding: 8px; border-radius: 4px; }}

h2 {{ font-size: 0.95rem; font-weight: 600; color: #aaa; margin: 24px 0 10px; border-bottom: 1px solid #2a2d3a; padding-bottom: 6px; }}
.filter-bar {{ display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }}
.fbtn {{ background: #1a1d27; border: 1px solid #2a2d3a; color: #aaa; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.78rem; }}
.fbtn.active {{ background: #1e2a3a; color: #60a5fa; border-color: #3a5a7a; }}
</style>
</head>
<body>
<div class="nav">
  <a href="index.html">← Home</a>
  <a href="coverage.html">Coverage</a>
  <a href="models.html">Models</a>
</div>

<h1>Character Test — {agent['name']}</h1>
<p class="subtitle">Agent #{agent['agent_id']} · age {agent['age']} · {level:.1f}% infection · {len(results)} configs · {ts[:4]}-{ts[4:6]}-{ts[6:8]}</p>

<div class="summary">
  <div class="stat"><label>Agent</label><value style="color:#f0f0f0">{agent['name']}, {agent['age']}</value></div>
  <div class="stat"><label>Traits</label><value style="color:#aaa;font-size:0.82rem">{agent['traits_str']}</value></div>
  <div class="stat"><label>Infection level</label><value style="color:#fbbf24">{level:.1f}%</value></div>
  <div class="stat"><label>Stay home (YES)</label><value style="color:#f87171">{n_yes}</value></div>
  <div class="stat"><label>Go out (NO)</label><value style="color:#4ade80">{n_no}</value></div>
  <div class="stat"><label>Format failures</label><value style="color:{'#fbbf24' if n_fmt else '#4ade80'}">{n_fmt}</value></div>
  <div class="stat"><label>Flagged</label><value style="color:{'#f87171' if flagged else '#4ade80'}">{len(flagged)}</value></div>
  <div class="stat"><label>Total cost</label><value style="color:#888">${data['total_cost']:.5f}</value></div>
</div>

{flagged_summary}

<h2>Prompt sent</h2>
<div class="prompt-box"><span class="agent-line">You are {agent['name']}. You are {agent['age']} years old.</span>
You are a person who is {agent['traits_str']}.
You live in the town of Dewberry Hollow. You have a job and go to the office for work every day.
You feel healthy and well.
You know about the Catasat virus spreading across the country. It is an airborne virus causing an infectious disease that spreads from human to human. The deadliness of the virus is unknown.
You check the newspaper and find that {level:.1f}% of Dewberry Hollow's population were diagnosed with new infections of the Catasat virus yesterday.
Should you stay at home for the entire day? Please provide your reasoning.

If the answer is "Yes", please state your reasoning as "Reasoning: [explanation]."
If the answer is "No", please state your reasoning as "Reasoning: [explanation]."

The format should be as follows:
Reasoning:
Response:

Example:
Reasoning: You are tired.
Response: Yes

You have to provide Response in a single word; it must be either "Yes" or "No".</div>

<h2>Responses by config</h2>
{cards_html}

</body>
</html>"""

    with open(path, "w") as f:
        f.write(html)


if __name__ == "__main__":
    main()
