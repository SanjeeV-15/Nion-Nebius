# Benchmark

Measured live on 2026-10-14; 2 run(s) per model, no fallback, one search allowed per question.

## nvidia/Nemotron-3-Ultra-550b-a55b

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 0.8 | 1.5 | 6 | 2/2 |
| plain question | 0.8 | 0.9 | 29 | 2/2 |
| places (search) | 3.8 | 4.6 | 56 | 2/2 |
| news (search) | 2.6 | 3.1 | 42 | 2/2 |
| save expense | 1.9 | 2.5 | 9 | 2/2 |
| add to visit list | 2.1 | 2.4 | 9 | 2/2 |
| recall spending | 1.3 | 2.2 | 8 | 1/2 (did not say 12) |
| recall list | 0.9 | 2.0 | 4 | 2/2 |
| set reminder | 2.0 | 2.3 | 13 | 2/2 |
| save draft | 2.6 | 2.7 | 14 | 2/2 |

Overall: 19/20 passed; median 2.1 s, slowest 4.6 s. Tokens used: 121006 in, 3804 out; Tavily searches: 4.

## nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B

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

Overall: 18/20 passed; median 3.5 s, slowest 22.0 s. Tokens used: 123843 in, 15559 out; Tavily searches: 3.

## nvidia/nemotron-3-super-120b-a12b

| Question | Median s | Slowest s | Words (median) | Passed |
|---|---|---|---|---|
| date (no search) | 0.9 | 0.9 | 8 | 2/2 |
| plain question | 0.8 | 0.9 | 36 | 2/2 |
| places (search) | 3.2 | 3.5 | 52 | 2/2 |
| news (search) | 2.7 | 2.9 | 60 | 2/2 |
| save expense | 1.8 | 2.1 | 15 | 2/2 |
| add to visit list | 1.9 | 2.0 | 10 | 2/2 |
| recall spending | 1.0 | 1.0 | 4 | 2/2 |
| recall list | 0.7 | 1.0 | 8 | 2/2 |
| set reminder | 2.1 | 2.1 | 24 | 2/2 |
| save draft | 2.2 | 2.2 | 25 | 2/2 |

Overall: 20/20 passed; median 1.9 s, slowest 3.5 s. Tokens used: 122875 in, 2363 out; Tavily searches: 4.

