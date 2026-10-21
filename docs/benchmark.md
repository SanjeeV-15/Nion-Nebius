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

