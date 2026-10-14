-- Apply explicitly to a dedicated PostgreSQL database; never run on startup.
CREATE TABLE pricer_visitors (id uuid PRIMARY KEY);
CREATE TABLE pricer_days (
  visitor_id uuid REFERENCES pricer_visitors(id), day date NOT NULL, used integer NOT NULL DEFAULT 0 CHECK(used >= 0),
  PRIMARY KEY(visitor_id, day)
);
CREATE TABLE pricer_estimates (
  id uuid PRIMARY KEY, visitor_id uuid NOT NULL REFERENCES pricer_visitors(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0, analyzed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft', state jsonb,
  customer_id text, accepted_quote_id text, booking_job_id text, final_completed_price numeric,
  actual_loads numeric, completion_date date, scope_change_reason text
);
CREATE INDEX pricer_recent ON pricer_estimates(created_at DESC,id DESC);
CREATE FUNCTION pricer_create(v uuid,e uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pricer_visitors(id) VALUES(v) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM pricer_visitors WHERE id=v FOR UPDATE;
  INSERT INTO pricer_estimates(id,visitor_id) SELECT e,v WHERE
    (SELECT count(*) FROM pricer_estimates WHERE visitor_id=v AND created_at>now()-interval '1 day')<30
    ON CONFLICT DO NOTHING;
END $$;
CREATE TABLE pricer_events (
  estimate_id uuid REFERENCES pricer_estimates(id), event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL, PRIMARY KEY(estimate_id,event_key)
);
CREATE TABLE pricer_requests (
  estimate_id uuid NOT NULL REFERENCES pricer_estimates(id), request_id uuid NOT NULL,
  digest text NOT NULL, status text NOT NULL, input jsonb NOT NULL, result jsonb, state jsonb,
  paid boolean NOT NULL, reserve_day date, lease uuid NOT NULL, expires_at timestamptz NOT NULL,
  tries integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(estimate_id,request_id)
);
CREATE TABLE pricer_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, estimate_id uuid REFERENCES pricer_estimates(id),
  request_id uuid, category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pricer_revisions (
  estimate_id uuid REFERENCES pricer_estimates(id), revision integer NOT NULL,
  request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), record jsonb NOT NULL,
  PRIMARY KEY(estimate_id,revision), UNIQUE(estimate_id,request_id)
);
CREATE TABLE pricer_photos (
  estimate_id uuid REFERENCES pricer_estimates(id), photo_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10),
  variant text NOT NULL CHECK(variant IN ('original','analysis')), pathname text NOT NULL UNIQUE,
  content_type text NOT NULL, bytes bigint NOT NULL, declared_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','complete','failed','deleted')), tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(estimate_id,photo_id,variant), UNIQUE(estimate_id,ordinal,variant)
);

-- Lock one durable visitor row: all jobs/tabs for this browser serialize quota decisions.
CREATE FUNCTION pricer_reserve(v uuid,e uuid,r uuid,d text,i jsonb,rev integer,paid_call boolean,
  enforce_limit boolean,daily_limit integer,revision_limit integer,l uuid,t timestamptz)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE job pricer_estimates; prior pricer_requests; day_key date; consumed integer; held integer;
BEGIN
  PERFORM 1 FROM pricer_visitors WHERE id=v FOR UPDATE;
  SELECT * INTO job FROM pricer_estimates WHERE id=e AND visitor_id=v FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"error":"not_found"}'; END IF;
  IF job.status='abandoned' THEN RETURN '{"error":"expired_job"}'; END IF;
  -- Expired workers cannot finalize. Release their reservations and retain a failure category.
  WITH expired AS (UPDATE pricer_requests q SET status='failed' FROM pricer_estimates j
    WHERE q.estimate_id=j.id AND j.visitor_id=v AND q.status='running' AND q.expires_at<=t
    RETURNING q.estimate_id,q.request_id)
    INSERT INTO pricer_failures(estimate_id,request_id,category) SELECT estimate_id,request_id,'lease_expired' FROM expired;
  SELECT * INTO prior FROM pricer_requests WHERE estimate_id=e AND request_id=r;
  IF FOUND THEN
    IF prior.digest<>d THEN RETURN '{"error":"idempotency_conflict"}'; END IF;
    IF prior.status='succeeded' THEN RETURN jsonb_build_object('cached',true,'result',prior.result,'state',prior.state); END IF;
    IF prior.status='running' THEN RETURN '{"error":"in_progress"}'; END IF;
    IF prior.tries>=3 THEN RETURN '{"error":"retry_limit"}'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pricer_requests WHERE estimate_id=e AND status='running') THEN RETURN '{"error":"in_progress"}'; END IF;
  IF job.revision<>rev THEN RETURN '{"error":"stale_revision"}'; END IF;
  IF job.revision>=24 OR (paid_call AND (SELECT count(*) FROM pricer_requests WHERE estimate_id=e AND paid)>=revision_limit AND prior.request_id IS NULL)
    THEN RETURN '{"error":"revision_limit"}'; END IF;
  day_key := (t AT TIME ZONE 'America/Los_Angeles')::date;
  IF paid_call AND NOT job.analyzed THEN
    INSERT INTO pricer_days(visitor_id,day) VALUES(v,day_key) ON CONFLICT DO NOTHING;
    SELECT used INTO consumed FROM pricer_days WHERE visitor_id=v AND day=day_key;
    SELECT count(*) INTO held FROM pricer_requests q JOIN pricer_estimates j ON j.id=q.estimate_id
      WHERE j.visitor_id=v AND q.reserve_day IS NOT NULL AND q.status='running';
    IF enforce_limit AND consumed+held>=daily_limit THEN RETURN '{"error":"daily_limit"}'; END IF;
  ELSE day_key:=NULL;
  END IF;
  INSERT INTO pricer_requests(estimate_id,request_id,digest,status,input,paid,reserve_day,lease,expires_at)
    VALUES(e,r,d,'running',i,paid_call,day_key,l,t+interval '3 minutes')
    ON CONFLICT(estimate_id,request_id) DO UPDATE SET status='running',lease=l,expires_at=t+interval '3 minutes',
      reserve_day=day_key,tries=pricer_requests.tries+1;
  RETURN jsonb_build_object('lease',l);
END $$;

CREATE FUNCTION pricer_finish(v uuid,e uuid,r uuid,l uuid,result_body jsonb,new_state jsonb,record_body jsonb,t timestamptz)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE q pricer_requests; job pricer_estimates;
BEGIN
  PERFORM 1 FROM pricer_visitors WHERE id=v FOR UPDATE;
  SELECT * INTO job FROM pricer_estimates WHERE id=e AND visitor_id=v FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO q FROM pricer_requests WHERE estimate_id=e AND request_id=r FOR UPDATE;
  IF NOT FOUND OR q.status<>'running' OR q.lease<>l OR q.expires_at<=t THEN RETURN false; END IF;
  IF q.paid AND NOT job.analyzed THEN
    -- Carry live reservations over midnight, but charge the date of successful completion.
    INSERT INTO pricer_days(visitor_id,day,used) VALUES(v,(t AT TIME ZONE 'America/Los_Angeles')::date,1)
      ON CONFLICT(visitor_id,day) DO UPDATE SET used=pricer_days.used+1;
  END IF;
  INSERT INTO pricer_revisions(estimate_id,revision,request_id,record) VALUES(e,job.revision+1,r,record_body);
  UPDATE pricer_estimates SET revision=revision+1,analyzed=analyzed OR q.paid,state=new_state,updated_at=t,
    status=CASE WHEN result_body->'baseline' IS NOT NULL AND result_body->'baseline'<>'null'::jsonb THEN 'provisional' ELSE 'scope_pending' END WHERE id=e;
  UPDATE pricer_requests SET status='succeeded',result=result_body,state=new_state WHERE estimate_id=e AND request_id=r;
  RETURN true;
END $$;

CREATE FUNCTION pricer_fail(v uuid,e uuid,r uuid,l uuid,category text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM pricer_visitors WHERE id=v FOR UPDATE;
  UPDATE pricer_requests SET status='failed' WHERE estimate_id=e AND request_id=r AND lease=l AND status='running'
    AND EXISTS(SELECT 1 FROM pricer_estimates WHERE id=e AND visitor_id=v);
  IF FOUND THEN INSERT INTO pricer_failures(estimate_id,request_id,category) VALUES(e,r,category); END IF;
END $$;

-- Explicit staff maintenance only. Never remove submitted revisions or website objects.
CREATE FUNCTION pricer_abandon(e uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v uuid; job pricer_estimates;
BEGIN
  SELECT visitor_id INTO v FROM pricer_estimates WHERE id=e;
  PERFORM 1 FROM pricer_visitors WHERE id=v FOR UPDATE;
  SELECT * INTO job FROM pricer_estimates WHERE id=e FOR UPDATE;
  IF NOT FOUND OR job.analyzed OR job.revision<>0 OR job.created_at>now()-interval '7 days'
    OR EXISTS(SELECT 1 FROM pricer_requests WHERE estimate_id=e AND status='running' AND expires_at>now())
    OR EXISTS(SELECT 1 FROM pricer_photos WHERE estimate_id=e AND updated_at>now()-interval '7 days')
    THEN RETURN false; END IF;
  UPDATE pricer_estimates SET status='abandoned' WHERE id=e;
  RETURN true;
END $$;
