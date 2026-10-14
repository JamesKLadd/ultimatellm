# Spike 1 – Can UltimateLLM use your paid plans instead of API keys?

**Date:** 2026-10-14 · **Status:** complete · **Answers:** [07 – Spike 1](../07-open-questions.md#spike-1--subscription-sign-in-vs-api-keys)

## TL;DR

API keys are **not** required everywhere. One provider now officially supports plan sign-in for apps like ours. Two others don't allow it but include monthly API credits with their top plans, so your subscription still pays for API-key usage.

| Provider | Plan sign-in in a third-party app? | What UltimateLLM will support | How your plan pays |
| --- | --- | --- | --- |
| **OpenAI** | ✅ **Yes.** *Sign in with ChatGPT* "ChatGPT plan usage", open to open-source and locally hosted apps. | **ChatGPT sign-in** (Plus/Pro) as the main OpenAI account type, with API keys as an alternative. | Requests draw from your ChatGPT plan allowance. You set a weekly cap per app in ChatGPT settings. |
| **Anthropic** | ❌ **No.** Explicitly prohibited for third-party apps. | API key. Later, an optional bridge that runs your own installed Claude Code (see below). | **Max 5x: $100/mo, Max 20x: $200/mo** of API credits once you link a Console organization to your plan. Your API key spends those first. Pro gets none. |
| **Google** | ❌ **No.** Reusing Gemini CLI's login breaks the terms, and accounts have been suspended for it. | Gemini API key (AI Studio). | **AI Pro: $10/mo, AI Ultra: $100/mo** in Google Cloud credits that can pay for the Gemini API. There's also a free tier. |
| **xAI** | ⚠️ **Partners only.** SuperGrok OAuth exists for selected tools (OpenCode, Warp) but there's no public developer program. | xAI API key. Revisit when xAI opens the program. | Nothing today: SuperGrok doesn't fund API usage. |

> **Change to requirement R7:** Grok bot needs an **xAI API account with credits**. A SuperGrok subscription doesn't give API access, so "requires a premium Grok subscription" should become "requires an xAI API key". The manager mostly uses fast, cheap Grok models, so this cost should stay small.

---

## OpenAI: Sign in with ChatGPT ✅

OpenAI turned *Sign in with ChatGPT* from identity-only into a way to spend a ChatGPT plan in other apps (expanded at DevDay, late Sept 2026).

**Who can use it** ([quickstart](https://developers.openai.com/siwc/quickstart), [open-source plan usage](https://developers.openai.com/siwc/token-sharing-open-source)):
- "ChatGPT plan usage is available to **all open-source partners** and selected private clients."
- The docs cover "**open-source and locally hosted apps**". Paid or remotely hosted apps go through an [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/).
- Eligible users: **ChatGPT Plus and Pro**. They can manage usage and access per app in ChatGPT settings.

**How it works** ([sign-in guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)). This fits a desktop app well:
- OAuth 2.0 Authorization Code + **PKCE**. It's a public client, so **no client secret**.
- **Dynamic registration:** the first sign-in uses `client_id=dynamic_agent_client` plus an `agent_name_hint` and a stable, opaque `ext_agent_host_id`. The callback returns our real `client_id` (`oaiapp_…`), which we save and reuse.
- Redirect: **loopback only**, `http://127.0.0.1:<any port>/auth/callback` (not `localhost`). Start the listener before opening the browser.
- Scopes: `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`. Check that `chatgpt.tokens.use.direct` was actually granted.
- Access tokens last about 1 hour. Refresh tokens **rotate**, so we must always replace the whole token set together.
- Endpoints: `auth.openai.com/api/accounts/authorize`, `…/oauth/token`. Inference: `POST https://api.openai.com/v1/responses`. Models: `GET /v1/models` (keep entries where `visibility == "list"`).

**Limits of plan-usage requests** ([models & inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)):
- `store: false` and `stream: true` are required. No `previous_response_id`, so full history is sent each time.
- No system-role items; use `instructions` or developer messages.
- Must omit `temperature`, `top_p`, `max_output_tokens`, `metadata`, `background`, `truncation`, `user` and a few others.
- Function tools must be grouped in **namespaces**.
- **Not supported:** image generation, Code Interpreter, file search, hosted MCP, audio/video input, transcription. Web search depends on the model and account policy.
- So OpenAI **image generation and voice transcription still need an API-key account** (or get routed to Google/xAI).

**Usage limits & errors** ([errors & recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)):
- No usage/rate-limit headers. A limit shows up as `response.failed` with `subscription_sharing_usage_limit_exceeded` (429).
- Recovery: pause plan requests and send the user to ChatGPT settings → Usage. The reset time isn't exposed.
- OpenAI says apps must not **silently** switch billing paths. So falling back from a ChatGPT plan account to a pay-per-token API key must be something the user explicitly allowed (see "Design impact").

**UI rules** ([UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)): the button says "Continue with ChatGPT". Show "Using ChatGPT plan" near the composer/model picker with a "Manage usage" link. Show the first-sign-in welcome dialog only once. If we ever sell plans, we must show which ones support ChatGPT plan usage.

**Phase 2 bonus:** the same token also works through **Codex app-server** ("directly and through Codex app-server"). That gives us a sanctioned, plan-funded coding-agent backend for local projects.

### ✅ Decided: UltimateLLM is open source (Apache-2.0)
The open path is for **open-source / locally hosted** apps. UltimateLLM is both: it is licensed under Apache-2.0 and runs locally, so it can use the open-source registration flow ([D-008](../decisions.md)). If a paid or hosted edition is ever offered, it goes through OpenAI's interest form.

---

## Anthropic: no third-party plan sign-in ❌ (but Max includes API credits)

The current [legal & compliance page](https://code.claude.com/docs/en/legal-and-compliance) is explicit:

> "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens."

> "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication."

This was enforced against third-party tools from January 2026, with a ToS clause added in February 2026 ([report](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)). **We won't build a Claude.ai login.**

**What your plan does give you:** [API credits for Max and Team plans](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers) (new as of Oct 7, 2026):
- **Max 5x: $100/month, Max 20x: $200/month** (Team: up to $500 pooled). **Pro: none.**
- On claude.ai → Settings → Billing → *API credits*, link a Claude Console organization. Then create an API key in that organization. Included credits are spent first. You don't need a payment method.
- Credits don't roll over. When they run out, requests stop (unless you bought extra credits). Usage is never charged to your plan.
- So for Max subscribers, **an Anthropic API key is effectively funded by the plan.** The account setup screen should explain this with a link.

**A sanctioned plan-funded option for later: the "Claude Code bridge" (Phase 2, optional).** The same legal page allows products to *run the unmodified Claude Code binary* when "an end user [signs] in to the unmodified Claude Code binary with their own Claude subscription". UltimateLLM could start your own installed Claude Code (headless) for coding subtasks. Conditions:
- Claude Code must be unmodified.
- You sign in through Claude Code's own `/login`.
- UltimateLLM **never reads or stores** those credentials.
- Nobody resells usage.

That fits local-project agent work, not general chat routing. Because Anthropic enforces these rules actively, we'd confirm with Anthropic ([contact link on that page](https://www.anthropic.com/contact-sales)) before shipping it to other people.

---

## Google: no third-party plan sign-in ❌ (but AI Pro/Ultra include Cloud credits)

Gemini CLI's [terms](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md) say:

> "Directly accessing the services powering Gemini CLI … using third-party software, tools, or services (for example, using OpenClaw with Gemini CLI OAuth) is a violation of applicable terms and policies. Such actions may be grounds for suspension or termination of your account."

The [FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md) says "the supported and secure method is to use a Vertex AI or Google AI Studio API key". Google suspended accounts for this in early 2026, including paying subscribers ([Google's discussion thread](https://github.com/google-gemini/gemini-cli/discussions/20632)). **We won't touch Gemini CLI or Antigravity OAuth.**

**What your plan does give you** ([Google blog, Jan 27 2026](https://blog.google/innovation-and-ai/technology/developers-tools/gdp-premium-ai-pro-ultra/)):
- **Google AI Pro: $10/month, AI Ultra: $100/month** in Google Cloud credits. They can be used for the Gemini API through AI Studio or Vertex AI.
- Activate at [developers.google.com/program/my-benefits](https://developers.google.com/program/my-benefits) and apply the credits to one Cloud billing account.
- ⚠️ Some users report the credits show up in Cloud Billing but AI Studio's prepay still asks for a top-up ([forum](https://discuss.ai.google.dev/t/10-monthly-developer-program-credits-visible-in-gcp-billing-but-ai-studio-forces-prepay-top-up-no-available-credits/143815)). We'll check this when building Google accounts in Phase 1.
- The Gemini API also has a **free tier** with lower rate limits. Fine for light routing and testing.

---

## xAI: partner-only plan sign-in ⚠️

- xAI's [developer docs](https://docs.x.ai/docs/overview) only document **API key** authentication.
- xAI [announced](https://x.ai/news/grok-opencode) (May 21, 2026) that SuperGrok/X Premium subscribers can use their subscription inside **OpenCode** through xAI OAuth, and "more open-source agents and integrations are coming soon".
- [Warp](https://docs.warp.dev/agents/inference/grok-subscription/) also supports it. Usage comes from SuperGrok's **one weekly pool shared across Grok chat, Grok Build and the API**.
- Other tools (Hermes Agent, etc.) copy another tool's OAuth client ID. There's no public registration program, and some SuperGrok tiers get HTTP 403 on inference. **Reusing someone else's client ID isn't something to build a product on.**
- SuperGrok doesn't include API credits. API billing is separate.

**Plan:** xAI API key now. Ask xAI to be included in the open-source OAuth program, which works best if we take the open-source route above. Add an `xai_oauth` account type when there's an official way to register.

---

## Design impact

1. **Account types per provider** (extends `ProviderAdapter.authTypes` in [04](../04-providers-and-accounts.md)):
   - OpenAI: `chatgpt_plan` (OAuth) · `api_key`
   - Anthropic: `api_key` (Phase 2 option: `claude_code_bridge`)
   - Google: `api_key`
   - xAI: `api_key` (future: `xai_oauth`)
2. **Priority & failover:** suggest putting plan accounts first in each priority list, since they're already paid for. Falling back from a plan account to a pay-per-token key needs an explicit per-provider setting: *"When my ChatGPT plan limit is reached: Pause / Use my next account"*. OpenAI's rules forbid silent billing switches, and it's a good rule anyway.
3. **Capabilities depend on the account:** the planner must know that a ChatGPT-plan account can't generate images or run Code Interpreter. Account capabilities are another constraint the planner's validator checks.
4. **Usage display:** plan accounts show "Using ChatGPT plan" and a *Manage usage* link instead of a dollar figure. API keys show tokens, cost and caps.
5. **Onboarding copy:** explain each provider's best option ("Have Claude Max? Link your Console org to get $100–200/mo of API credits") so you get the most from what you already pay for.
6. **Re-check in Phase 1.** All of this changed several times in 2026. Re-read the linked primary pages before building each sign-in flow.
