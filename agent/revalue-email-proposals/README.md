# The email agent ("Customer emails to 360 proposals")

A copy of the files of the scheduled task `revalue-email-proposals`, kept here so they are not lost with one person's PC.
The live copy is whatever the Claude desktop app runs; **changing a file here changes nothing until it is copied to where the task runs**,
and a change made to the running task should be copied back here.

## The files

| File | What it is |
|---|---|
| `SKILL.md` | The agent's written instructions: what to search, how to decide what is relevant, every kind of proposal, the rules it must never break. Edit this to change how the agent behaves. |
| `intake-mcp.js` | A small local tool server ("revalue-intake") with no dependencies. It gives the agent a few named tools: call 360's intake addresses (`https://solargik-tracker.vercel.app/api/intake/...`) and `save_attachment`. It reads `INTAKE_TOKEN` itself so the agent never sees it. |
| `save-attachment.ps1` | Used by `save_attachment`. Reads classic Outlook (read only), saves one PDF into a project's `Contracts + Legal` folder in the synced SharePoint library, never overwrites or deletes. |
| `intake.ps1` | An older helper that posts to the intake addresses from PowerShell. The task now uses `intake-mcp.js` instead; kept for reference. |

## Running it on a machine

1. Install the Claude desktop app and sign in; connect the **Microsoft 365** connector to the mailbox the agent should read.
   The agent reads only the mailbox of that connection.
2. Put these four files in a folder, for example `C:\Users\<you>\.claude\scheduled-tasks\revalue-email-proposals\`.
3. Register the tool server. In the code folder's `.mcp.json` (not committed; it is excluded locally) use:
   `{"mcpServers": {"revalue-intake": {"command": "node", "args": ["<full path to intake-mcp.js>"]}}}`.
   The paths inside the comments of the two `.ps1` files show the old location and are only examples.
4. Create the Windows **user** environment variable `INTAKE_TOKEN` with the same value as `INTAKE_TOKEN` in Vercel.
   Never put the value in a file, in chat or in an email.
5. For saving PDFs: classic Outlook installed, and the library synced to `OneDrive - Solargik\Projects - EXECUTION`.
6. Create a scheduled task in the Claude app with the contents of `SKILL.md` as its instructions, every three hours
   (`0 0,3,6,9,12,15,18,21 * * *`), then use "Run now" and read the summary.
7. Check the Inbox page of 360: "Last email check" should show the new run.

See `CLAUDE.md` (the Inbox paragraph) for what each kind of proposal does when a person approves it.
