export const profile = {
  name: 'Atikul Islam',
  title: 'Data Analyst',
  tagline: 'Turning large, messy datasets into decisions people can act on.',
  location: 'Dhaka, Bangladesh',
  stats: [
    { value: '10M+', label: 'daily records analyzed' },
    { value: '5', label: 'BI platforms delivered on' },
    { value: '4+', label: 'years in analytics' },
  ],
  photo: '/profile.jpg',
  photoAlt: 'Portrait of Atikul Islam',
  email: 'atikuldipto111@gmail.com',
  phone: '+880 1316328548',
  github: 'https://github.com/Atikul-Dipto',
  githubHandle: 'Atikul-Dipto',
  linkedin: 'https://www.linkedin.com/in/atikul-islam-0a77561b3/',
  linkedinHandle: 'atikul-islam-0a77561b3',
  resumeUrl: '/Atikul_Islam_Resume.pdf',
  bio: [
    "I'm a ",
    { text: 'Data Analyst', emphasis: true },
    ' with a background in Economics, working at the intersection of large-scale e-commerce data, operational reporting, and business strategy. ',
    "I've analyzed ",
    { text: '10M+ daily transactional records', emphasis: true },
    ', built ',
    { text: 'KPI dashboards across Power BI, Tableau, Metabase, Apache Superset, and Streamlit', emphasis: true },
    ' that cut manual reporting time, and worked cross-functionally to keep data clean and decisions grounded in evidence. Before data, I spent years in consulting and competitive debating — which is where the habit of asking "what does this number actually mean" comes from.',
  ],
}

export const skills = [
  {
    group: 'Technical',
    items: ['SQL', 'Python (Pandas, NumPy)', 'PostgreSQL', 'Power BI', 'Tableau', 'Metabase', 'Apache Superset', 'SPSS', 'STATA', 'Excel'],
  },
  {
    group: 'Analytics',
    items: ['Data Cleaning & Validation', 'Dashboard Development', 'Customer Behavior Analysis', 'KPI Reporting', 'Market Research', 'Business Analysis'],
  },
  {
    group: 'Tools & Other',
    items: ['Git / GitHub', 'Jupyter Notebook', 'SurveyCTO', 'Kobo Toolbox'],
  },
]

export const experience = [
  {
    role: 'Data Analyst',
    org: 'US Bangla Group',
    location: 'Dhaka, Bangladesh',
    period: 'Jul 2025 — Present',
    points: [
      'Analyze high-volume e-commerce datasets exceeding 10M+ daily transactional records to identify customer behavior patterns and operational trends.',
      'Developed operational dashboards tracking daily KPIs across sales and customer activity, reducing manual reporting time for business teams.',
      'Collaborate with cross-functional teams to clean, validate, and interpret data, improving reporting accuracy and operational efficiency.',
    ],
  },
  {
    role: 'Associate',
    org: 'Inspira Advisory and Consulting Limited',
    location: 'Dhaka, Bangladesh',
    period: 'Jan 2025 — Jul 2025',
    points: [
      'Performed market assessments, research analysis, and business evaluations to deliver strategic insights for consulting projects across diverse sectors.',
      'Interpreted quantitative and qualitative data to evaluate program effectiveness and support evidence-based recommendations.',
      'Prepared client-facing reports, presentations, and proposals while coordinating with stakeholders on business strategy and policy advisory initiatives.',
    ],
  },
  {
    role: 'R&D Intern',
    org: 'ARCED Foundation',
    location: 'Dhaka, Bangladesh',
    period: 'Apr 2024 — Jul 2024',
    points: [
      'Conducted data quality audits and validation checks for the "Use of Lead Acid Battery 2024" research project, funded by Georgetown and Stanford Universities.',
      'Performed quality assurance and data verification for mystery shopping exercises, ensuring research accuracy and consistency.',
      'Supported research operations through data transcription, SurveyCTO form management, and analytical reporting.',
    ],
  },
]

export const education = {
  degree: 'Bachelor of Social Science in Economics',
  school: 'East West University',
  period: '2019 — 2024',
  detail: 'Coursework: Applied Econometrics, Game Theory, Labor Economics, Project Analysis, Law and Economics',
}

export const certifications = [
  'Intermediate Python — DataCamp',
  'Data Manipulation with pandas — DataCamp',
  'Advanced AI+ Prompt Engineering — NetCom Learning',
  'Web Designing — Creative IT',
]

export const projects = [
  {
    title: 'NeerVibe — Logistics Control Tower',
    summary: 'A real-time operating picture for a courier network, end to end.',
    description: 'AI-native control tower for a synthetic Bangladesh logistics network — 16 modules (dispatch, hubs, fleet, riders, COD finance, exceptions, forecasting) over a FastAPI + PostGIS backend, live vehicle telemetry over WebSockets, and a TensorFlow ETA model. Vehicles move along real OSRM road geometry.',
    screenshot: '/project-neervibe.svg',
    tags: ['Next.js', 'FastAPI', 'PostGIS', 'TensorFlow'],
    href: 'https://github.com/Atikul-Dipto/neervibe',
    demoHref: 'https://neervibe.vercel.app',
    placeholder: false,
  },
  {
    title: 'Price Pulse',
    summary: 'A price-history storehouse for Bangladesh e-commerce, not a one-off snapshot.',
    description: 'Selenium pipeline scraping 8 marketplaces (Daraz, Startech, Pickaboo, Chaldal…) into a Postgres price-history store, with a FastAPI backend, cross-store comparison of the same product, a click-through price chart, and a grounded local-LLM recap of each trend.',
    screenshot: '/project-price-pulse.svg',
    tags: ['Selenium', 'PostgreSQL', 'FastAPI', 'React'],
    href: 'https://github.com/Atikul-Dipto/Atikul-Dipto.github.io/tree/main/ecommerce-price-tracker',
    demoHref: '/price-pulse/',
    placeholder: false,
  },
  {
    title: 'Live Logistics Flow Map',
    summary: 'A living map of shipment lanes, hotspots, and network importance.',
    description: 'A standalone React + D3 companion to the Logistics Operations Portal — animates real shipment lane volumes as moving particles across a Bangladesh map, with live DBSCAN hotspot clustering and graph centrality ranking, all client-side.',
    screenshot: '/project-logistics-flow-map.svg',
    tags: ['React', 'D3', 'Canvas', 'DBSCAN'],
    href: 'https://github.com/Atikul-Dipto/logistics-flow-map',
    demoHref: 'https://atikul-dipto.github.io/logistics-flow-map/',
    placeholder: false,
  },
  {
    title: 'Prottoy — Career Center for Job Seekers',
    summary: 'Scan a resume, fix it against a live ATS score, and get matched to jobs you can apply to in one click.',
    description: 'A React + FastAPI platform for job seekers in Bangladesh: an ATS resume scanner, a live resume builder with PDF/DOCX export, and an engineering & data job board fed by a multi-source ingestion engine (official ATS APIs plus robots.txt-respecting scraping) that ranks every listing against your resume. Light/dark UI with a three.js hero; Postgres, scheduled GitHub Actions ingestion, and a stateless API built to scale.',
    screenshot: '/project-ats-resume-scanner.svg',
    tags: ['React', 'three.js', 'FastAPI', 'PostgreSQL'],
    href: 'https://github.com/Atikul-Dipto/ats-resume-scanner',
    demoHref: 'https://atikul-dipto.github.io/ats-resume-scanner/',
    placeholder: false,
  },
  {
    title: 'Logistics Operations Portal',
    summary: 'Operational control center for shipment, inventory, and courier performance.',
    description: 'A multi-page Streamlit dashboard for a synthetic Bangladesh e-commerce logistics network — shipment tracking, inventory, and delivery analytics across 5 warehouses and 5 couriers.',
    screenshot: '/project-logistics-portal.svg',
    tags: ['Python', 'Streamlit', 'Pandas', 'Plotly'],
    href: 'https://github.com/Atikul-Dipto/logistics-portal',
    demoHref: null,
    placeholder: false,
  },
  {
    title: 'Work Signal',
    summary: 'Where the job market is moving, from real listings and official statistics, now part of Prottoy.',
    description: 'A job-market dashboard inside Prottoy: most-demanded skills with two-week trends, companies hiring, locations, work modes, weekly momentum and posted salaries, all computed from real open listings, with every signal linking to the postings behind it. Alongside official Bangladesh labour statistics from the World Bank API.',
    screenshot: '/project-work-signal.svg',
    tags: ['React', 'FastAPI', 'PostgreSQL'],
    href: 'https://github.com/Atikul-Dipto/ats-resume-scanner',
    demoHref: 'https://atikul-dipto.github.io/ats-resume-scanner/#/market',
    placeholder: false,
  },
]

export const writing = [
  {
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

// Queries written for my own projects' databases (NeerVibe on Postgres/PostGIS,
// Price Pulse on Postgres). Nothing here comes from an employer's schema.
export const sqlQueries = [
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
