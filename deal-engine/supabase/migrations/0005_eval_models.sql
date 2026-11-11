-- Record which model wrote the copy and which judged it, so runs on different models can be compared.
alter table public.eval_runs add column gen_model text, add column judge_model text;
update public.eval_runs set gen_model = model, judge_model = model where gen_model is null;
