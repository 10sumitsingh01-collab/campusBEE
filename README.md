# CampusBEE

## Demo accounts

On the sign-in screen, select **Demo workspace**. All four demo accounts use the password `12345678`. [Open CampusBEE sign-in](https://campusbee.vercel.app/login).

| Role | Demo email |
| --- | --- |
| Student | `Student@bmsit.in` |
| Club Organizer (CLUSTER4) | `Club@bmsit.in` |
| Judge | `Judge@bmsit.in` |
| College Admin | `Admin@bmsit.in` |

To present the event workflow, open the sign-in page in four tabs and choose a different account in each. Each tab keeps its own session. The demo accounts share practice data, so use fictional details for registrations and submissions.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Run a three-computer campus rehearsal

Use one Mac or Linux machine as the host. With the dependencies installed, run
`npm run build`, then `npm run start:campus -- --hostname <host-LAN-IP>`.
Open `http://<host-LAN-IP>:3001/login` on all three machines on the same
private network. Keep the host running. On each computer choose **Create account**,
enter an individual email and password, and select a role. Returning users sign
in with the same credentials. Organizers create their own club during signup.
In the local prototype, anyone with access to the signup page can register as College Admin.

1. **Club Organizer** — Open Crew Sync AI and create a published competition
   for your own club. Pick a future date. Set minimum and maximum team size
   to 1 for a solo rehearsal.
2. **Student** — Find the competition, open Event details, register, and check
   My Tickets. In Competitions & Results select the same event and submit the
   project title, description, and optional link. Larger teams must lock
   their roster in My Teams & Registrations first.
3. **Club Organizer** — In Competitions & Results, select the event and
   choose a registered judge by name and email, then assign each student's submission.
4. **Judge** — Select the event in Judging desk, review the assigned project,
   enter a rubric score and submit it. The student can see the leaderboard.
5. **College Admin** — Use Campus operations to manage venues and attendance.

The shared host saves the event, registration, project, assignment, and score
in `.campus-data/demo.json`. Restarting with the same command restores them.
Accounts and sessions persist in the same private snapshot. Each student's
tickets and submissions belong to their account. A judge sees the submissions
assigned to that judge. Use unique prototype passwords on the trusted HTTP
LAN. Use HTTPS when collecting real credentials outside this rehearsal.

### Gemini for organisers

The campus host can enable Gemini for event blurbs, collaborations and reports. Create a key in [Google AI Studio](https://aistudio.google.com/apikey), set `GEMINI_API_KEY` in the host's ignored `.env.local` file and restart the Next.js server. The optional `GEMINI_MODEL` setting overrides the default `gemini-3.8-flash`. The browser only receives configuration status and generated text. A missing key or unavailable provider uses a local template. Venue conflict checks run locally in either mode.

In **Create Campus Event**, enter a title and tags, then choose **Suggest event blurb**. Review the draft and choose **Use this description** to put it in the editable event form.
