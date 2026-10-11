---
doc: scope
status: approved
---

# Nion

A hands-free voice companion for people on the move: you talk, it talks back like a person on a phone call, so you can get answers and think things through without looking at a screen.

## The Unique Kernel
Nion feels like another person on the other end of a call, not a search box. It knows roughly where you are, talks back in a natural voice, uses your name, asks follow-up questions, and can think a decision through with you ("I got a cake last time and it wasn't good... what do you think?"). The back-and-forth conversation is the point, not a list of results on a screen.

## Who It's For
A traveler moving through an airport with their hands full and earphones in. They are rushing to a gate, or just landed in a new city, and they have random questions: where to eat nearby, what time it is back home, how to get from the airport to downtown. Today they stop, pull out their phone, and type. The same idea could help anyone who wants less screen time (commuters, people resting their eyes), but travelers come first.

## The Core Loop
They say "Hey Nion" and ask something out loud, for example "what are some places to eat around me, ranked by price?" Nion answers in a spoken voice and asks if they want to narrow it down. They answer, Nion follows up, and the conversation continues without touching the phone. They come back whenever a question or decision comes up and they can't, or don't want to, look at a screen.

## Inspiration & Identity
- A Jarvis-style personal assistant (Iron Man) that you talk to and that talks back.
- "Like talking to another person on the phone": warm, conversational, personal. It greets you by name ("Hey Sanjeev...").
- Name: Nion, taken from the last letters of "Companion."
- Tone: helpful partner who gives an opinion and asks good questions, not a robotic reader of search results.

## Why This Matters to the Learner
"A lot of times, I can't just go every time, look at my mobile, type in the answer, read it out." It was really helpful when traveling through an airport, and when their eyes hurt and they want to rest but keep working. They want a wide audience to experience it, and they want the first version narrow and effective, "I don't want to overdo the overkill."

## What "Working" Looks Like
A short demo on a phone with earphones. The person says "Hey Nion" and:
1. Asks for places to eat around them ranked by price. Nion answers aloud with places, prices and cuisine, then asks if they want to narrow it down.
2. Asks the time in Denver. Nion answers aloud ("It's 11:59 pm in Denver").
3. Asks how to get from Denver International Airport to Union Station. Nion gives a spoken answer with a few options.
4. Talks through a personal decision, like the cake example. Nion gives an opinion and asks a follow-up question.

The "oh, that's cool" beat is the natural back-and-forth: they never touch the screen, and Nion sounds like a person who knows where they are.

## The POC Boundary
In:
- Voice in and voice out: the person speaks, Nion replies aloud.
- Activated by voice ("Hey Nion"); exactly how is a spec decision.
- Knows roughly where the person is, for local questions.
- General knowledge questions, time in other cities, and local suggestions (places to eat, getting around).
- Back-and-forth conversation, including follow-up questions and thinking through a decision.
- Addresses the user by name.
- One device for the demo: a phone with earphones.

## Later
- Checking messages and email ("you have three unread, want to know who from?").
- Reading out and managing a to-do list, recurring tasks, reminders.
- Booking and doing things on the user's behalf.
- Watch and other devices.

## Explicitly Cut
- A full to-do list or task manager: the first version is conversation, and the learner wants to avoid overkill.
