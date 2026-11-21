# Ep. 05: Supabase (narration script)

OpenScreen project: **Ep.5 Supabase — final edit**. Each beat is one voiceover file and the same sentence as its caption. "At" is where the beat starts on the editor's ruler; inside a speed region the ruler moves faster than the voice, so those beats are short.

| #   | At (ruler) | On screen                                    | Narration = caption                                                                                                                                     |
| --- | ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | 0.5        | Supabase pricing, then the self-hosting docs | Supabase gives you a database, user sign-ups and file storage in one place. On their cloud, extra storage and extra users are billed as you grow.       |
| 02  | 10.5       | Self-hosting docs scrolling                  | You can run it on your own server for free, but the official guide starts with Docker and a long list of settings to get right.                         |
| 03  | 20.5       | Dashboard, Quick Launch: app, then cluster   | With LaraKube Desktop, pick Supabase, then the server it should run on.                                                                                 |
| 04  | 28.5       | Configuration step                           | Type the address you want. The domain and a free SSL certificate are set up for you, and you can switch off the parts you don't need to save memory.    |
| 05  | 42.0       | Review and Launch                            | Check the summary, and launch.                                                                                                                          |
| 06  | 48.0       | Install progress (sped up 6×)                | LaraKube sets up the database, sign-ins, storage and the admin dashboard, one step at a time.                                                           |
| 07  | 105.6      | "Supabase is ready"                          | A minute or so later, Supabase is live, with its own address and its admin login.                                                                       |
| 08  | 110.5      | Studio overview, Table Editor                | This is Supabase Studio, running on your own server. The Table Editor works like a spreadsheet for your data.                                           |
| 09  | 126.0      | SQL editor                                   | And when you want more control, there's a full SQL editor too.                                                                                          |
| 10  | 138.5      | Database, Users, Storage                     | Your tables, the people who sign up to your app, and the files they upload all live here.                                                               |
| 11  | 162.0      | Studio's Edge Functions page                 | Edge Functions are small pieces of your own code that run on the server. Self-hosted, that usually means copying files and restarting services by hand. |
| 12  | 171.0      | Desktop: Supabase page, Developer tab        | LaraKube adds a Developer tab. Choose your functions folder,                                                                                            |
| 13  | 186.5      | Deploy runs, both functions appear           | and every function goes live with its own web address.                                                                                                  |
| 14  | 214.5      | Browser: `hello`                             | Open the link, and your code answers from your own server.                                                                                              |
| 15  | 222.5      | Browser: `todo-summary`                      | This one fetches a to-do list from another service and sums it up.                                                                                      |

Captions: bottom third (x 50, y 90), white bold on rgba(0, 0, 0, 0.85), fade, spanning exactly their beat's audio.

Voice: James Carlo, `MygA9aaydxOchycGVIMI`, model `eleven_v4`, one file per beat (`ep05-01.mp3` … `ep05-15.mp3`).

## Outro

| #   | At (ruler) | On screen                                                                                        | Narration = caption                                                                                                   |
| --- | ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 16  | 229.0      | Studio home, then the Desktop dashboard with the end card "LaraKube Desktop · docs.larakube.app" | That's Supabase, running on your own server, set up in one click with LaraKube Desktop. Links are in the description. |

## Thumbnail

https://claude.ai/artifact/EkJwfZWBzX6Ukn7tTEx5ta (badge "NO DOCKER, NO YAML", headline "Your own **Supabase**, in one click", callout "Live in about a minute", mockup: the "Supabase is ready" Quick Launch panel).

## YouTube metadata

**Titles (A/B test)**

1. LaraKube Desktop: Install Supabase (Self-Hosted Backend) in One Click (main)
2. Self-Host Supabase on Your Own Server in About a Minute, No Docker, No YAML
3. Your Own Supabase, Edge Functions Included: One-Click Self-Hosting

**Description**

```text
Watch LaraKube Desktop install Supabase — an open-source backend with a Postgres database, user sign-ups and file storage — on your own server with a single click. No Docker, no YAML, no terminal.

Supabase is an open-source backend: a Postgres database, user sign-ups, file storage and Edge Functions in one place, often described as an open-source alternative to Firebase. In this video:
📌 Supabase Cloud bills usage beyond each plan's limits (on Pro, extra disk is $0.125 per GB), and the official self-hosting guide starts with Docker and a long list of settings.
📌 LaraKube Desktop does it in one click instead — DNS and a free SSL certificate are wired up automatically, no config needed.
📌 Studio, Auth and Storage come ready to use, and LaraKube Desktop's Developer tab deploys your own Edge Functions from a folder, each with its own web address.
📌 From click to live URL, start to finish.

This is Episode 5 of a series showing LaraKube Desktop installing popular self-hosted apps — Episode 4 covered WordPress.

🔗 Docs: https://docs.larakube.app
```

**Tags**

```text
laravel,kubernetes,opentofu,docker,deploy,selfhosted,devtools,supabase,postgres,backend
```
