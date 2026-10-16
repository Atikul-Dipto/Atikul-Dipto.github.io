/**
 * Central portfolio configuration (spec §12).
 *
 * CONTENT RULE: every value here is real, taken from the live portfolio data.
 * Fields we do not have verified values for are left `undefined` and the UI
 * hides them — nothing is invented. Known gaps are listed in MISSING_CONTENT
 * at the bottom so they are visible rather than silently fabricated.
 */

export type Id = string

export interface ExternalLink {
  label: string
  href: string
}

export interface Identity {
  name: string
  headline: string
  specialisms: string[]
  intro: string
  location: string
  portrait: string
  email: string
  phone?: string
  links: ExternalLink[]
  /** Password-protected at time of writing — see MISSING_CONTENT. */
  cvUrl?: string
  cvNote?: string
}

export interface ExperienceRecord {
  id: Id
  org: string
  orgNote?: string
  orgUrl?: string
  logo?: string
  logoDark?: string
  role: string
  start: string // ISO yyyy-mm
  end?: string // omitted = current
  location: string
  responsibilities: string[]
  tools?: string[]
  /** Only ever set from verified sources. */
  achievements?: string[]
  relatedProjects?: Id[]
  floor: number
}

export interface ProjectRecord {
  id: Id
  title: string
  summary: string
  description: string
  tags: string[]
  categories: ProjectCategory[]
  repo?: string
  demo?: string
  screenshot?: string
  /** Deliberately absent unless verified — never fabricate metrics. */
  dataset?: string
  results?: string[]
}

export type ProjectCategory =
  | 'Business Intelligence'
  | 'SQL'
  | 'Python'
  | 'Economics'
  | 'Statistics'
  | 'Machine Learning'
  | 'Product Analytics'

export interface EducationRecord {
  id: Id
  qualification: string
  institution: string
  start: string
  end: string
  coursework: string[]
  thesis?: string
  researchInterests?: string[]
}

export interface CertificationRecord {
  id: Id
  name: string
  issuer: string
  issued?: string
  expires?: string
  verifyUrl?: string
  skills?: string[]
}

export interface SkillSystem {
  id: Id
  name: string
  blurb: string
  tools: string[]
  evidence?: Id[]
}

export interface MethodRecord {
  id: Id
  name: string
  blurb: string
  evidence?: Id[]
}

export interface WritingRecord {
  id: Id
  title: string
  publication: string
  date: string
  dateLabel?: string
  kind?: string
  summary: string
  href: string
  tags?: string[]
}

export const identity: Identity = {
  name: 'ATIKUL ISLAM',
  headline: 'Data Analyst | Economics | Business Intelligence',
  specialisms: ['Business Intelligence', 'SQL & Data Modelling', 'Customer Behaviour Analysis', 'Applied Econometrics'],
  intro: 'I turn complex data into clear insights, useful products, and better decisions.',
  location: 'Dhaka, Bangladesh',
  portrait: 'profile.jpg',
  email: 'atikuldipto111@gmail.com',
  phone: '+880 1316328548',
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/atikul-islam-0a77561b3/' },
    { label: 'GitHub', href: 'https://github.com/Atikul-Dipto' },
    { label: 'Portfolio', href: 'https://atikul-islam-portfolio.pages.dev/' },
  ],
  cvUrl: '/Atikul_Islam_Resume.pdf',
  cvNote: 'The published PDF is password-protected; the viewer offers a direct download.',
}

export const experience: ExperienceRecord[] = [
  {
    id: 'cartup',
    org: 'Cartup',
    orgNote: 'a concern of US Bangla Group',
    orgUrl: 'https://cartup.com/',
    logo: 'logos/cartup.svg',
    logoDark: 'logos/cartup.svg',
    role: 'Data Analyst',
    start: '2025-07',
    location: 'Dhaka, Bangladesh',
    responsibilities: [
      'Analyze high-volume e-commerce datasets exceeding 10M+ daily transactional records to identify customer behavior patterns and operational trends.',
      'Developed operational dashboards tracking daily KPIs across sales and customer activity, reducing manual reporting time for business teams.',
      'Collaborate with cross-functional teams to clean, validate, and interpret data, improving reporting accuracy and operational efficiency.',
    ],
    tools: ['SQL', 'PostgreSQL', 'Python', 'Power BI', 'Metabase', 'Excel'],
    floor: 2,
  },
  {
    id: 'inspira',
    org: 'Inspira Advisory and Consulting',
    orgUrl: 'https://inspira-bd.com/',
    logo: 'logos/inspira.png',
    logoDark: 'logos/inspira-white.png',
    role: 'Associate',
    start: '2025-01',
    end: '2025-07',
    location: 'Dhaka, Bangladesh',
    responsibilities: [
      'Performed market assessments, research analysis, and business evaluations to deliver strategic insights for consulting projects across diverse sectors.',
      'Interpreted quantitative and qualitative data to evaluate program effectiveness and support evidence-based recommendations.',
      'Prepared client-facing reports, presentations, and proposals while coordinating with stakeholders on business strategy and policy advisory initiatives.',
    ],
    tools: ['Excel', 'SPSS', 'STATA', 'Market Research'],
    floor: 3,
  },
  {
    id: 'arced',
    org: 'ARCED Foundation',
    orgNote: 'Aureolin Research, Consultancy & Expertise Development',
    orgUrl: 'https://arced.foundation/',
    logo: 'logos/arced.png',
    logoDark: 'logos/arced-white.png',
    role: 'R&D Intern',
    start: '2024-04',
    end: '2024-07',
    location: 'Dhaka, Bangladesh',
    responsibilities: [
      'Conducted data quality audits and validation checks for the "Use of Lead Acid Battery 2024" research project, funded by Georgetown and Stanford Universities.',
      'Performed quality assurance and data verification for mystery shopping exercises, ensuring research accuracy and consistency.',
      'Supported research operations through data transcription, SurveyCTO form management, and analytical reporting.',
    ],
    tools: ['SurveyCTO', 'Kobo Toolbox', 'Excel', 'Data Quality Audits'],
    floor: 4,
  },
]

export const projects: ProjectRecord[] = [
  {
    id: 'neervibe',
    title: 'NeerVibe — Logistics Control Tower',
    summary: 'A real-time operating picture for a courier network, end to end.',
    description:
      'AI-native control tower for a synthetic Bangladesh logistics network — 16 modules (dispatch, hubs, fleet, riders, COD finance, exceptions, forecasting) over a FastAPI + PostGIS backend, live vehicle telemetry over WebSockets, and a TensorFlow ETA model. Vehicles move along real OSRM road geometry.',
    tags: ['Next.js', 'FastAPI', 'PostGIS', 'TensorFlow'],
    categories: ['Business Intelligence', 'Python', 'SQL', 'Machine Learning', 'Product Analytics'],
    repo: 'https://github.com/Atikul-Dipto/neervibe',
    demo: 'https://neervibe.vercel.app',
    screenshot: 'project-neervibe.svg',
  },
  {
    id: 'price-pulse',
    title: 'Price Pulse',
    summary: 'A price-history storehouse for Bangladesh e-commerce, not a one-off snapshot.',
    description:
      'Selenium pipeline scraping 8 marketplaces (Daraz, Startech, Pickaboo, Chaldal…) into a Postgres price-history store, with a FastAPI backend, cross-store comparison of the same product, a click-through price chart, and a grounded local-LLM recap of each trend.',
    tags: ['Selenium', 'PostgreSQL', 'FastAPI', 'React'],
    categories: ['SQL', 'Python', 'Product Analytics', 'Business Intelligence'],
    repo: 'https://github.com/Atikul-Dipto/Atikul-Dipto.github.io/tree/main/ecommerce-price-tracker',
    demo: '/price-pulse/',
    screenshot: 'project-price-pulse.svg',
  },
  {
    id: 'flow-map',
    title: 'Live Logistics Flow Map',
    summary: 'A living map of shipment lanes, hotspots, and network importance.',
    description:
      'A standalone React + D3 companion to the Logistics Operations Portal — animates real shipment lane volumes as moving particles across a Bangladesh map, with live DBSCAN hotspot clustering and graph centrality ranking, all client-side.',
    tags: ['React', 'D3', 'Canvas', 'DBSCAN'],
    categories: ['Statistics', 'Machine Learning', 'Business Intelligence'],
    repo: 'https://github.com/Atikul-Dipto/logistics-flow-map',
    demo: 'https://atikul-dipto.github.io/logistics-flow-map/',
    screenshot: 'project-logistics-flow-map.svg',
  },
  {
    id: 'prottoy',
    title: 'Prottoy — Career Center for Job Seekers',
    summary: 'Scan a resume, fix it against a live ATS score, and get matched to jobs you can apply to in one click.',
    description:
      'A React + FastAPI platform for job seekers in Bangladesh: an ATS resume scanner, a live resume builder with PDF/DOCX export, and an engineering & data job board fed by a multi-source ingestion engine (official ATS APIs plus robots.txt-respecting scraping) that ranks every listing against your resume. Light/dark UI with a three.js hero; Postgres, scheduled GitHub Actions ingestion, and a stateless API built to scale.',
    tags: ['React', 'three.js', 'FastAPI', 'PostgreSQL'],
    categories: ['Python', 'Product Analytics', 'Machine Learning'],
    repo: 'https://github.com/Atikul-Dipto/ats-resume-scanner',
    demo: 'https://atikul-dipto.github.io/ats-resume-scanner/',
    screenshot: 'project-ats-resume-scanner.svg',
  },
  {
    id: 'logistics-portal',
    title: 'Logistics Operations Portal',
    summary: 'Operational control center for shipment, inventory, and courier performance.',
    description:
      'A multi-page Streamlit dashboard for a synthetic Bangladesh e-commerce logistics network — shipment tracking, inventory, and delivery analytics across 5 warehouses and 5 couriers.',
    tags: ['Python', 'Streamlit', 'Pandas', 'Plotly'],
    categories: ['Business Intelligence', 'Python'],
    repo: 'https://github.com/Atikul-Dipto/logistics-portal',
    screenshot: 'project-logistics-portal.svg',
  },
  {
    id: 'work-signal',
    title: 'Work Signal',
    summary: 'Where the job market is moving, from real listings and official statistics, now part of Prottoy.',
    description:
      'A job-market dashboard inside Prottoy: most-demanded skills with two-week trends, companies hiring, locations, work modes, weekly momentum and posted salaries, all computed from real open listings, with every signal linking to the postings behind it. Alongside official Bangladesh labour statistics from the World Bank API.',
    tags: ['React', 'FastAPI', 'PostgreSQL'],
    categories: ['Business Intelligence', 'Economics', 'Product Analytics'],
    repo: 'https://github.com/Atikul-Dipto/ats-resume-scanner',
    demo: 'https://atikul-dipto.github.io/ats-resume-scanner/#/market',
    screenshot: 'project-work-signal.svg',
  },
]

export const education: EducationRecord[] = [
  {
    id: 'ewu-econ',
    qualification: 'Bachelor of Social Science in Economics',
    institution: 'East West University',
    start: '2019',
    end: '2024',
    coursework: [
      'Applied Econometrics',
      'Game Theory',
      'Labor Economics',
      'Project Analysis',
      'Law and Economics',
    ],
  },
]

export const certifications: CertificationRecord[] = [
  { id: 'dc-python', name: 'Intermediate Python', issuer: 'DataCamp', skills: ['Python'] },
  { id: 'dc-pandas', name: 'Data Manipulation with pandas', issuer: 'DataCamp', skills: ['pandas', 'Python'] },
  { id: 'netcom-ai', name: 'Advanced AI+ Prompt Engineering', issuer: 'NetCom Learning' },
  { id: 'creative-web', name: 'Web Designing', issuer: 'Creative IT' },
]

export const skillSystems: SkillSystem[] = [
  {
    id: 'sql',
    name: 'SQL & Data Querying',
    blurb: 'Window functions, CTEs, gap-filling and conditional aggregates against Postgres.',
    tools: ['SQL', 'PostgreSQL', 'PostGIS', 'SQLite', 'SQLAlchemy'],
    evidence: ['neervibe', 'price-pulse'],
  },
  {
    id: 'python',
    name: 'Python & Data Analysis',
    blurb: 'Cleaning, reshaping and modelling data; scraping pipelines that run unattended.',
    tools: ['Python', 'pandas', 'NumPy', 'scikit-learn', 'Selenium'],
    evidence: ['price-pulse', 'logistics-portal'],
  },
  {
    id: 'bi',
    name: 'BI & Dashboard Development',
    blurb: 'Operational dashboards that replace manual reporting cycles.',
    tools: ['Power BI', 'Tableau', 'Metabase', 'Apache Superset', 'Streamlit', 'Plotly'],
    evidence: ['logistics-portal', 'neervibe'],
  },
  {
    id: 'pipelines',
    name: 'Pipelines & Automation',
    blurb: 'Scheduled ingestion, schema design and data-quality checks.',
    tools: ['FastAPI', 'Docker', 'Redis', 'Supabase', 'Git'],
    evidence: ['price-pulse', 'neervibe'],
  },
  {
    id: 'research',
    name: 'Field Research & Collection',
    blurb: 'Survey instruments, enumerator QA and verification for funded research.',
    tools: ['SurveyCTO', 'Kobo Toolbox', 'SPSS', 'STATA'],
  },
  {
    id: 'reporting',
    name: 'Spreadsheets & Reporting',
    blurb: 'The reporting layer most of a business actually reads.',
    tools: ['Excel', 'Google Sheets'],
  },
]

export const methods: MethodRecord[] = [
  { id: 'cleaning', name: 'Data Cleaning & Validation', blurb: 'Audits, validation rules and reconciliation before anything is reported.' },
  { id: 'eda', name: 'Exploratory Data Analysis', blurb: 'Finding the shape of a dataset before committing to a model.' },
  { id: 'customer', name: 'Customer Behaviour Analysis', blurb: 'Cohorts, retention and purchase patterns over transactional data.', evidence: ['price-pulse'] },
  { id: 'timeseries', name: 'Time-Series & Trend Analysis', blurb: 'Rolling windows, gap-filled calendars and seasonality.', evidence: ['neervibe'] },
  { id: 'econometrics', name: 'Applied Econometrics', blurb: 'Regression and causal reasoning from an Economics background.' },
  { id: 'kpi', name: 'KPI Design & Reporting', blurb: 'Defining a metric so two teams compute it the same way.', evidence: ['neervibe'] },
  { id: 'viz', name: 'Data Visualisation', blurb: 'Charts that answer a question rather than decorate a slide.', evidence: ['flow-map'] },
  { id: 'market', name: 'Market Research', blurb: 'Assessments and evaluations for consulting engagements.' },
]

export const writing: WritingRecord[] = [
  {
    id: 'shared-data',
    title: "Why Bangladesh's logistics sector needs shared data",
    publication: 'Daily Times of Bangladesh',
    date: '2026-09-14',
    dateLabel: '14 Sep 2026',
    kind: 'Op-ed',
    summary:
      "Bangladesh's logistics inefficiency is a fragmented-information problem more than an infrastructure one. Shared shipment data across couriers could cut costs by over a third, lift exports by ~20%, and rebuild consumer trust in e-commerce delivery.",
    href: 'https://tob.news/why-bangladeshs-logistics-sector-needs-shared-data/',
    tags: ['Logistics', 'Data policy', 'E-commerce'],
  },
]

// ---------------------------------------------------------------------------
// Copied word for word from the standard portfolio (src/data.js at the repo
// root), so the silo carries everything the site does. Edit both together.
// ---------------------------------------------------------------------------

export const profile = {
  title: 'Data Analyst',
  tagline: 'Turning large, messy datasets into decisions people can act on.',
  stats: [
    { value: '10M+', label: 'daily records analyzed' },
    { value: '5', label: 'BI platforms delivered on' },
    { value: '4+', label: 'years in analytics' },
  ],
  bio:
    "I'm a Data Analyst with a background in Economics, working at the intersection of large-scale e-commerce data, operational reporting, and business strategy. I've analyzed 10M+ daily transactional records, built KPI dashboards across Power BI, Tableau, Metabase, Apache Superset, and Streamlit that cut manual reporting time, and worked cross-functionally to keep data clean and decisions grounded in evidence. Before data, I spent years in consulting and competitive debating — which is where the habit of asking \"what does this number actually mean\" comes from.",
}

export interface SkillGroup {
  group: string
  items: string[]
}

/** The standard portfolio's skills, all three lists. */
export const skillGroups: { software: SkillGroup[]; analytics: SkillGroup[]; soft: SkillGroup[] } = {
  software: [
    { group: 'BI & Dashboards', items: ['Power BI', 'Tableau', 'Metabase', 'Apache Superset', 'Streamlit', 'Plotly', 'D3.js'] },
    { group: 'Databases & Storage', items: ['SQL', 'PostgreSQL', 'PostGIS', 'SQLite', 'Supabase', 'Redis', 'SQLAlchemy'] },
    { group: 'Languages & Libraries', items: ['Python', 'pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'Selenium'] },
    { group: 'Statistics & Spreadsheets', items: ['SPSS', 'STATA', 'Excel', 'Google Sheets'] },
    {
      group: 'Engineering & Workflow',
      items: ['Git', 'GitHub', 'Jupyter', 'Docker', 'FastAPI', 'React', 'Next.js', 'MapLibre', 'Vercel', 'Render'],
    },
    { group: 'Field Research & Collection', items: ['SurveyCTO', 'Kobo Toolbox'] },
  ],
  analytics: [
    {
      group: 'Data Preparation',
      items: ['Data Cleaning & Validation', 'Data Quality Audits', 'ETL & Data Pipelines', 'Web Scraping', 'Data Transformation', 'Schema Design'],
    },
    {
      group: 'Analysis & Modelling',
      items: ['Exploratory Data Analysis', 'Customer Behaviour Analysis', 'Cohort & Retention Analysis', 'Time-Series & Trend Analysis', 'Applied Econometrics', 'Statistical Testing', 'Forecasting'],
    },
    {
      group: 'Reporting & Research',
      items: ['KPI Design & Reporting', 'Dashboard Development', 'Data Storytelling', 'Market Research', 'Survey Design & Sampling', 'Business Analysis', 'Requirement Gathering'],
    },
  ],
  soft: [
    {
      group: 'Communication',
      items: ['Competitive Debating', 'Public Speaking', 'Data Storytelling', 'Client Reporting & Presentations', 'Technical Writing'],
    },
    { group: 'Collaboration', items: ['Cross-functional Teamwork', 'Stakeholder Management', 'Mentoring & Training', 'Negotiation'] },
    {
      group: 'Working Style',
      items: ['Analytical Problem Solving', 'Critical Thinking', 'Attention to Detail', 'Ownership & Follow-through', 'Time Management'],
    },
  ],
}

export interface SqlQuery {
  id: Id
  title: string
  question: string
  project: string
  dialect: string
  techniques: string[]
  note: string
  sql: string
}

// Queries written for my own projects' databases (NeerVibe on Postgres/PostGIS,
// Price Pulse on Postgres). Nothing here comes from an employer's schema.
export const sqlQueries: SqlQuery[] = [
  {
    id: 'hub-dwell',
    title: 'Hub dwell time from an event log',
    question: 'How long does a parcel sit in a hub before it is dispatched?',
    project: 'NeerVibe',
    dialect: 'PostgreSQL',
    techniques: ['Window functions', 'LAG', 'Percentiles'],
    note: 'Pair every scan event with the one before it, then keep only ARRIVED_AT_HUB → DISPATCHED transitions. Powers the "avg hub processing" KPI on the control tower.',
    sql: `-- Pair each event with the previous one for the same parcel,
-- then keep only the hub-arrival -> dispatch transitions.
WITH ordered AS (
  SELECT
    package_id,
    new_status,
    "timestamp",
    LAG(new_status)  OVER w AS prev_status,
    LAG("timestamp") OVER w AS prev_timestamp
  FROM package_events
  WINDOW w AS (PARTITION BY package_id ORDER BY "timestamp")
)
SELECT
  round(avg(extract(epoch FROM ("timestamp" - prev_timestamp)) / 60), 1) AS avg_hub_minutes,
  percentile_cont(0.9) WITHIN GROUP (
    ORDER BY extract(epoch FROM ("timestamp" - prev_timestamp)) / 60
  )                                                                     AS p90_hub_minutes
FROM ordered
WHERE new_status  = 'DISPATCHED'
  AND prev_status = 'ARRIVED_AT_HUB';`,
  },
  {
    id: 'hub-load',
    title: 'Live hub load vs. rated capacity',
    question: 'Which hubs are under the most pressure right now?',
    project: 'NeerVibe',
    dialect: 'PostgreSQL',
    techniques: ['CTE', 'LEFT JOIN', 'NULLIF'],
    note: 'The stored current_load column drifted, so load is derived from the parcels actually sitting at each node. LEFT JOIN + COALESCE keeps empty hubs in the ranking instead of silently dropping them.',
    sql: `-- Derive load from the parcels physically at each node
-- rather than trusting a counter nothing maintains.
WITH node_loads AS (
  SELECT current_node_id AS node_id, count(*) AS load
  FROM packages
  WHERE current_node_id IS NOT NULL
    AND current_status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'LOST', 'DAMAGED')
  GROUP BY current_node_id
)
SELECT
  n.node_code,
  n.node_name,
  coalesce(nl.load, 0)                                                  AS current_load,
  n.capacity,
  round(coalesce(nl.load, 0)::numeric / nullif(n.capacity, 0) * 100, 2) AS utilisation_pct
FROM logistics_nodes n
LEFT JOIN node_loads nl ON nl.node_id = n.id
WHERE n.operating_status = 'OPERATIONAL'
ORDER BY current_load DESC
LIMIT 5;`,
  },
  {
    id: 'delivery-kpis',
    title: 'Delivery quality KPIs in one pass',
    question: 'First-attempt success, return rate, and 24h throughput — without a CASE WHEN in sight.',
    project: 'NeerVibe',
    dialect: 'PostgreSQL',
    techniques: ['FILTER clause', 'Conditional aggregates', 'Intervals'],
    note: "Postgres' aggregate FILTER reads like the KPI definition itself. Each statement scans its table exactly once, however many metrics you add.",
    sql: `-- First-attempt success rate: only the first attempt per parcel counts.
SELECT
  round(
    count(*) FILTER (WHERE attempt_number = 1 AND result = 'SUCCESS')::numeric
    / nullif(count(*) FILTER (WHERE attempt_number = 1), 0) * 100, 1
  ) AS first_attempt_success_pct
FROM delivery_attempts;

-- Parcel outcomes and last-24h throughput from a single scan of packages.
SELECT
  count(*)                                                        AS total_parcels,
  count(*) FILTER (WHERE current_status IN
                   ('RETURN_REQUESTED', 'RETURN_IN_TRANSIT', 'RETURNED')) AS returns,
  count(*) FILTER (WHERE current_status = 'CANCELLED')            AS cancelled,
  count(*) FILTER (WHERE current_status = 'DELIVERED'
                     AND actual_delivery_at >= now() - interval '24 hours') AS delivered_24h
FROM packages;`,
  },
  {
    id: 'price-moves',
    title: 'Biggest price moves since the last scrape',
    question: 'For every product, what is the latest price and how much did it move?',
    project: 'Price Pulse',
    dialect: 'PostgreSQL',
    techniques: ['ROW_NUMBER', 'LAG', 'Ranked subquery'],
    note: 'One window pass over price_history replaces two correlated subqueries per product. This is what the /api/products endpoint runs (via SQLAlchemy) to show "was ৳X, now ৳Y".',
    sql: `-- Rank each product's history newest-first and look one row back
-- for the previous price, in a single pass.
WITH ranked AS (
  SELECT
    p.site,
    p.product_name,
    h.current_price,
    h.scraped_at,
    LAG(h.current_price) OVER (PARTITION BY h.product_id ORDER BY h.scraped_at)      AS previous_price,
    ROW_NUMBER()         OVER (PARTITION BY h.product_id ORDER BY h.scraped_at DESC) AS rn
  FROM price_history h
  JOIN products p ON p.id = h.product_id
)
SELECT
  site,
  product_name,
  current_price,
  previous_price,
  round((current_price - previous_price) / nullif(previous_price, 0) * 100, 1) AS change_pct
FROM ranked
WHERE rn = 1
  AND previous_price IS NOT NULL
ORDER BY change_pct
LIMIT 20;`,
  },
  {
    id: 'daily-throughput',
    title: 'Daily deliveries with a 7-day rolling average',
    question: 'What does throughput look like day by day — including the quiet days?',
    project: 'NeerVibe',
    dialect: 'PostgreSQL',
    techniques: ['generate_series', 'Gap filling', 'Rolling window'],
    note: 'A GROUP BY alone drops days with zero deliveries, which bends every trend line. Generating the calendar first and LEFT JOINing onto it keeps the x-axis honest.',
    sql: `-- Build the calendar first so zero-delivery days stay on the chart.
WITH days AS (
  SELECT generate_series(
    date_trunc('day', now() - interval '29 days'),
    date_trunc('day', now()),
    interval '1 day'
  )::date AS day
),
delivered AS (
  SELECT actual_delivery_at::date AS day, count(*) AS n
  FROM packages
  WHERE current_status = 'DELIVERED'
    AND actual_delivery_at >= now() - interval '30 days'
  GROUP BY 1
)
SELECT
  d.day,
  coalesce(x.n, 0) AS delivered,
  round(avg(coalesce(x.n, 0)) OVER (
    ORDER BY d.day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ), 1)            AS rolling_7d
FROM days d
LEFT JOIN delivered x USING (day)
ORDER BY d.day;`,
  },
]

export interface DashboardCase {
  id: Id
  title: string
  dataset: string
  purpose: string
  question: string
  findings: Array<{ headline: string; detail: string }>
  build: Array<[string, string]>
  tags: string[]
  caveats: string[]
  highlights: Array<[string, string]>
  repo: string
}

const POWERBI_REPO = 'https://github.com/Atikul-Dipto/Atikul-Dipto.github.io/tree/main/powerbi'

/** Power BI case studies. Neither is published as a live report yet. */
export const dashboards: DashboardCase[] = [
  {
    id: 'paysim-fraud',
    title: 'Mobile money fraud detection',
    dataset: 'PaySim synthetic mobile-money log (Kaggle), 6,362,620 transactions',
    purpose:
      'Score the fraud rule a bank already has against the ground truth, and test whether a single derived feature does better.',
    question: 'Is the detection rule in production actually catching fraud?',
    findings: [
      {
        headline: 'The existing rule catches 16 of 8,213 frauds',
        detail: 'Perfect precision, 0.195% recall. It stopped 77.8M and let 11.98bn through.',
      },
      {
        headline: 'One derived feature reaches 97.8% recall with zero false positives',
        detail:
          'The amount moved equals the origin account’s opening balance to the cent — the account emptied in one move. True on 8,034 of 8,213 fraud legs and 1 of 6,354,407 legitimate ones. A 502x lift in recall.',
      },
      {
        headline: 'Overnight transactions are 422x likelier to be fraud',
        detail:
          'Fraud volume holds steady around the clock while legitimate volume collapses, so the rate runs 0.053% to 22.3% across the simulated day. A staffing conclusion, not a blocking one.',
      },
    ],
    build: [
      ['Model', 'Star schema: one 6.36M-row fact, four dimensions, four single-direction relationships'],
      ['Measures', '38 DAX measures in six display folders, every one using KEEPFILTERS so it cannot contradict the reader’s own filter'],
      ['Format', 'Power BI Project (PBIP) — TMDL semantic model and PBIR report, both plain text and reviewable in git rather than sealed in a .pbix'],
      ['Pipeline', 'Python builds the star schema from the raw CSV and flags its own data-quality defects'],
      ['Dashboard', '4 pages, 72 visuals, 4 slicers synced across every page'],
    ],
    tags: ['Power BI', 'DAX', 'TMDL', 'Star schema', 'Python'],
    caveats: [
      'The data is synthetic. PaySim simulates a mobile money network; it is not a record of anything that happened, and no employer data is involved.',
      'The 97.8% figure is in-sample: the rule was derived from the same labels it is scored against. On real data it would need a held-out period first.',
    ],
    highlights: [
      ['16 of 8,213', 'caught by the existing rule'],
      ['97.8%', 'recall from one derived feature'],
      ['0', 'false positives, either rule'],
      ['422x', 'overnight fraud-rate spread'],
    ],
    repo: `${POWERBI_REPO}/paysim-fraud`,
  },
  {
    id: 'price-pulse-bi',
    title: 'Price Pulse — retail assortment and pricing',
    dataset: 'My own Selenium scraper, 2,211 observations across 6 Bangladesh marketplaces',
    purpose:
      'Compare how six marketplaces price and discount, on data from a pipeline I wrote and therefore have to audit.',
    question: 'What can a two-day scrape honestly tell you, and what can it not?',
    findings: [
      {
        headline: 'The scraper had a selector bug, and the dashboard found it',
        detail:
          'Pickaboo prices arrive as two numbers concatenated: 194500195000 is the sale price and the was-price glued together. It affects 17 of Pickaboo’s 154 observations and almost nothing elsewhere.',
      },
      {
        headline: 'Cross-retailer price comparison is not possible here',
        detail:
          'Only 2 of 750 distinct product names appear at more than one retailer, so the model compares assortments and pricing behaviour instead of the same basket.',
      },
      {
        headline: 'Two distinct scrape days means no trend',
        detail:
          'A Days With Data measure exists so a page can state its own limit rather than drawing a two-point line and calling it a trend.',
      },
    ],
    build: [
      ['Model', 'Star schema over the scraper’s SQLite: fact plus product, retailer and date dimensions'],
      ['Measures', '15 DAX measures across volume, pricing, discounting and data quality'],
      ['Data quality', 'Suspect rows keep a blank price, so every price aggregation drops them automatically — no filter to remember'],
      ['Pipeline', 'Selenium scraper into SQLite, then a Python export to the star schema'],
    ],
    tags: ['Power BI', 'DAX', 'TMDL', 'Selenium', 'SQLite'],
    caveats: [
      'Public product listings I scraped myself. No employer data.',
      'A two-day snapshot. The time dimension becomes worth using once the scraper has run daily for a few weeks.',
    ],
    highlights: [
      ['2,211', 'price observations'],
      ['6', 'marketplaces'],
      ['11%', 'of one retailer’s rows caught as malformed'],
      ['15', 'DAX measures'],
    ],
    repo: `${POWERBI_REPO}/price-pulse`,
  },
]

/**
 * Gaps the 12-level spec asks for that we do NOT have verified content for.
 * Surfaced in the UI (Deep Core > records status) rather than filled with
 * invented values. Supply any of these and the relevant level fills itself.
 */
export const MISSING_CONTENT = [
  'Unlocked CV PDF (the published file is password-protected)',
  'Silo cutaway blueprint referenced as the architectural reference',
  'Thesis / research work and research interests (Level 08)',
  'Certification issue dates, expiry dates and verification URLs (Level 09)',
  'Personal interests and hobbies (Level 06)',
  'Verified project metrics, dataset scale and client names (Level 07)',
  'Real product screenshots — current previews are illustrative mockups',
  'A contact-form backend endpoint (Level 12 falls back to mailto)',
] as const
