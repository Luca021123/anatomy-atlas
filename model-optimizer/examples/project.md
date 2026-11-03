# Clinic booking app (MVP)

Build a minimal appointment-booking web app for a small medical practice. Stack: TypeScript, Next.js, PostgreSQL via Prisma, deployed on Vercel. Patient data is personal health information and must be handled under POPIA.

## Plan

1. Design the database schema and the booking rules, including double-booking prevention under concurrent requests and time-zone handling.
2. Implement the booking API (list slots, book, reschedule, cancel) following the booking rules.
3. Write integration tests for the booking API, including a concurrency test.
4. Build the patient booking UI: accessible, mobile-first, in the practice's brand colours.
5. Write the email reminder job that runs 24 hours before each appointment.
6. Convert each of the 3 practitioners' weekly schedules from the spreadsheet into seed data (batch, nobody is waiting on this).
7. Review the whole app for POPIA compliance and write the deployment checklist.
