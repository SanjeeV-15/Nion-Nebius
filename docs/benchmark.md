# Benchmark

Measured live on 2026-10-21; 2 run(s) per model, no fallback, one search allowed per question.

## nvidia/nemotron-3-super-120b-a12b

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 1.0 | 5.2 | 8 | 2/2 |
| plain question | 0.9 | 1.2 | 27 | 2/2 |
| places (search) | 4.1 | 5.1 | 59 | 2/2 |
| news (search) | 4.0 | 5.7 | 67 | 1/2 (too long (91 words)) |
| save expense | 2.0 | 2.3 | 15 | 2/2 |
| add to visit list | 1.7 | 1.8 | 14 | 2/2 |
| recall spending | 0.9 | 1.0 | 7 | 2/2 |
| recall list | 1.0 | 1.0 | 8 | 2/2 |
| set reminder | 2.0 | 2.3 | 19 | 2/2 |
| save draft | 2.0 | 4.7 | 28 | 2/2 |

Overall: 19/20 passed; median 2.0 s, slowest 5.7 s. Tokens used: 134318 in, 2541 out; Tavily searches: 4.

## nvidia/Nemotron-3-Ultra-550b-a55b

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 1.1 | 1.2 | 6 | 2/2 |
| plain question | 0.9 | 1.3 | 32 | 2/2 |
| places (search) | 3.8 | 4.1 | 56 | 2/2 |
| news (search) | 5.4 | 6.3 | 41 | 2/2 |
| save expense | 2.3 | 3.0 | 8 | 2/2 |
| add to visit list | 2.4 | 3.2 | 9 | 2/2 |
| recall spending | 1.1 | 1.4 | 8 | 2/2 |
| recall list | 1.6 | 1.6 | 9 | 2/2 |
| set reminder | 2.7 | 2.7 | 21 | 2/2 |
| save draft | 3.4 | 3.5 | 17 | 2/2 |

Overall: 20/20 passed; median 2.4 s, slowest 6.3 s. Tokens used: 131170 in, 3483 out; Tavily searches: 4.

---

## Earlier run, 2026-10-14: the three models side by side

This is the run that ruled out Nemotron 3 Nano. It used the same ten questions, 2 runs per model, no fallback, and one search allowed per question. It ran before the later change that made news searches use Tavily's `basic` depth, so times for the news question are not comparable with the run above.

| Model | Passed | Median | Slowest | Tokens in / out | Tavily searches |
|---|---|---|---|---|---|
| nvidia/nemotron-3-super-120b-a12b | 20/20 | 1.9 s | 3.5 s | 122,875 / 2,363 | 4 |
| nvidia/Nemotron-3-Ultra-550b-a55b | 19/20 | 2.1 s | 4.6 s | 121,006 / 3,804 | 4 |
| nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | 18/20 | 3.5 s | 22.0 s | 123,843 / 15,559 | 3 |

Nano used about 6.6 times Super's output tokens and about 4 times Ultra's. Its per-question results in that run:

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 1.2 | 10.2 | 5 | 2/2 |
| plain question | 1.2 | 4.5 | 24 | 2/2 |
| places (search) | 14.7 | 22.0 | 0 | 0/2 (error TimeoutError; empty reply) |
| news (search) | 6.2 | 14.1 | 45 | 2/2 |
| save expense | 3.7 | 5.8 | 21 | 2/2 |
| add to visit list | 3.4 | 4.6 | 16 | 2/2 |
| recall spending | 0.7 | 1.0 | 7 | 2/2 |
| recall list | 1.1 | 1.6 | 7 | 2/2 |
| set reminder | 3.5 | 5.9 | 15 | 2/2 |
| save draft | 2.9 | 3.2 | 17 | 2/2 |

