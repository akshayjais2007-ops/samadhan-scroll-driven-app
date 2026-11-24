# Samadhan · 60-second demo script

**Goal:** in one minute a judge understands the problem, meets the person it affects, sees the product working end to end, and believes the value for a ward.

**Format:** screen recording of the live site at 1440×810, then a phone at 390×844 for the last fifteen seconds. Native scrolling only. Voiceover in English; press EN | हिं once at 0:47 to show Hindi.

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00–0:04 | **The opening.** The Ward 14 roads draw themselves, landmarks fade in, one pin drops at the market gate, the wordmark resolves. **Your ward. Your voice.** A language chooser appears on a first visit. | "Every ward in India has potholes, dead streetlights, garbage and water leaks. Samadhan is how a ward answers them." |
| 0:04–0:10 | **01 / 06 · Hero.** The intro lifts into the hero. The map is quiet. One pin drops in. Headline *Fix your street.* | "Meera Gupta runs a tiffin stall at this gate. She reported this pothole six days ago. Nothing has happened, and nothing shows her why." |
| 0:10–0:18 | **02 / 06 · The gap.** Camera pushes into the pin. The complaint card unfolds: photo, geotag, category, *Submitted 6 days ago, no update*. Headline *Reported. Then silence.* | "One complaint, one pin, and then silence. No status, no owner, no deadline." |
| 0:18–0:26 | **03 / 06 · The system.** Camera pulls back. Four duplicates glide in and merge into one pin. Callouts draw in: DUPLICATES MERGED, GEOTAG, NEAR SCHOOL. Headline *Many reports, one issue.* | "Four neighbours reported the same hole. Samadhan merges reports within 125 metres, so the ward sees one issue, not five tickets — and it notes the school nearby." |
| 0:26–0:34 | **04 / 06 · The function.** *I see this too* taps. Votes tick to three, the pin grows and turns amber to red, the score counts up, the *Why this priority* chips appear, and *Verified* settles in. Headline *Neighbours confirm.* | "Neighbours confirm with one tap. Three confirmations verify it automatically. And the priority is never a black box: category, neighbours, days open, near school — the chips add up to the score on the pin." |
| 0:34–0:44 | **05 / 06 · The peak.** A scripted officer console. The timeline advances. The SLA ring fills, an overdue pulse plays and the escalation badge steps up to Zonal officer. The after photo slides in. The citizen confirms. The pin turns green, the stats tick, an SMS arrives. Headline *Assigned. Tracked. Fixed.* | "The officer assigns the work. Every stage runs against a deadline, and when work runs late it escalates up the ladder automatically. To close it, the officer must attach an after photo. Then the resident confirms — or reopens it, which sends it straight back with higher priority. That's accountability, not a spectacle." |
| 0:44–0:49 | **06 / 06 · The resolution.** The map settles mostly green. Stats: resolved, average fix time, past deadline, escalated. Headline *A ward that answers.* | "Now every resident can see what's open, what was fixed, how fast, and what slipped." |
| 0:49–0:54 | **Ward stats (public).** Open the Ward stats tab. No login. Show the numbers, the read-only priority queue and the recurring spots. | "All of this is public. Anyone in the ward can read it, without an account." |
| 0:54–1:00 | **Login and dashboards.** Tap **Log in** → **Try demo citizen** (Meera). *My dashboard*: her four reports, the *Awaiting your confirmation* card on WR14-1048, her verifications, her SMS thread. Press **Try demo officer** → **Officer console**: KPI tiles, the priority queue, assign to a team, the escalation ladder, Export CSV. Switch the theme to **Dark**: the ward at night, the reported dead streetlight still dark. Press EN | हिं to show the whole site in Hindi. | "Sign in as Meera and you see your own street. Sign in as the ward officer and you see the whole ward, prioritised, with a clock on every issue. Samadhan: a ward that answers." |

## Shot list and cues

1. **Open on the intro.** Let the roads draw. Do not skip it — it is the brand and it is only three seconds.
2. **On first load**, the language chooser appears. Pick English (or Hindi, and then say the headline in Hindi).
3. **Scroll slowly through 02** and pause one beat with the card fully open. Do not read the card aloud.
4. **In 03**, keep the cursor off the map so the three callouts read cleanly.
5. **In 04**, let the three taps land on the beat, then hold one second on the *Why this priority* chips. That is the credibility moment.
6. **In 05**, pause on the overdue pulse and the escalation badge, then on the after photo. Those two beats carry the whole argument.
7. **In the app**, drop a pin within 125 m of the market-gate pothole so *Similar report nearby* appears reliably — tap just east of the gate on the main road. A guest is asked to log in, and the action resumes right after sign-in.
8. **For voice**, use Chrome on Android or desktop where the Web Speech API exists. If it does not, the app says so plainly and typing still works — worth showing, not hiding.
9. **For the night map**, switch the theme to Dark. Working streetlights glow; the reported dead pole on the school road stays dark.
10. **For the dashboards**, use the one-tap demo shortcuts. Judges decide in seconds.

## Proof points to name if asked

- Duplicate radius: 125 m, same category, open reports only.
- Priority: category weight × 10 + verifications × 3 + days open × 3 (capped at 10) + context boost + reopen boost 10.
- Context boost: +10 per nearby school, bus stop, metro station or hospital within about 100 m, capped at +20.
- Bands: High 70+, Medium 45+, Low below 45. Auto-Verified at 3 verifications from three different citizens.
- SLA: pothole 5 days, garbage 2, streetlight 3, water leak 1.
- Escalation: Ward officer 0–2 days overdue, Zonal officer 3–5, Commissioner's office 6+.
- Resolving requires an after photo. Confirm closes; Reopen returns to Assigned with +10 priority and a logged event.
- Role guards run on the server: a citizen cannot assign, resolve or export, and only the reporter can close the loop.
- Privacy: no reporter name or number is ever shown publicly; a number is masked (`98•••••210`) and visible only to its owner.
- Payload: no video, no animation or map libraries, ~219 KB of gzipped JavaScript, images compressed client-side.

## One-line close

"Samadhan turns complaints into a ward's public record of what it fixed — and what it didn't."
