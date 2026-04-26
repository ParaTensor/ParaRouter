---
name: "Debug Provider Model Catalog Sync"
description: "Investigate why a provider's Sync model catalog action fails, especially for NewAPI/OpenAI-compatible providers like memtensor"
argument-hint: "Provider id, base URL, available test-key source, and the observed failure"
agent: "agent"
model: "GPT-5 (copilot)"
---
Investigate why the provider model catalog sync fails for a NewAPI or OpenAI-compatible provider.

Treat the task as an implementation task, not just an explanation. Start from the concrete code path that powers the Providers page sync action and stay on the narrowest slice until the issue is reproduced, explained, and validated.

Inputs to collect from the user or current context:
- Provider account id
- Provider base URL
- A test API key source, if one is available
- The observed failure mode: UI message, API response, logs, or screenshot

Constraints:
- Do not persist API keys or other secrets into repository files, prompt files, tests, or terminal history beyond what is required for the current run.
- Prefer extending an existing targeted test over adding ad hoc scripts.
- Keep changes minimal and validate with the narrowest executable check.

Code anchors:
- Refresh route: [hub/routes/providers.ts](../../hub/routes/providers.ts)
- Catalog fetcher: [hub/utils.ts](../../hub/utils.ts)
- Existing memtensor/NewAPI test: [hub/tests/memtensor_newapi_models.test.ts](../../hub/tests/memtensor_newapi_models.test.ts)
- Hub test script: [hub/package.json](../../hub/package.json)

Required workflow:
1. Reproduce the failure starting from the refresh endpoint used by the Providers page.
2. Trace the request into `fetchProviderSupportedModelsWithLog` and identify which candidate model-list URL is being attempted.
3. Compare the upstream response shape and auth behavior against the NewAPI model-list contract. Use the NewAPI docs only as a behavioral reference, not as a reason to rewrite working code.
4. Reuse or extend the existing memtensor-focused test when the provider is memtensor or another NewAPI deployment. Prefer a test that verifies:
   - unauthenticated `/v1/models` returns the expected auth failure shape
   - authenticated model listing is parsable by the Hub fetcher
   - the successful candidate URL is visible in `fetch_log`
5. If the issue is in ParaRouter code, make the smallest root-cause fix.
6. Run the most focused validation available, then report the outcome.

Expected output:
- Root cause in one sentence
- Whether the problem is provider configuration, authentication, URL normalization, response-shape parsing, or another local bug
- The exact fix made, if any
- The validation command(s) run and what they proved
- Any remaining ambiguity that still requires user input

If the user provides a concrete test key, use it only for the live check during the current task and keep it out of saved files.