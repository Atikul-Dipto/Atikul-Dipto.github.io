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
  summary: string
  href: string
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
    { label: 'Portfolio', href: 'https://atikul-dipto.github.io/' },
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
    summary: 'Scan a resume, fix it against a live ATS score, and get matched to jobs.',
    description:
      'A React + FastAPI platform for job seekers in Bangladesh: an ATS resume scanner, a live resume builder with PDF/DOCX export, and an engineering & data job board fed by a multi-source ingestion engine that ranks every listing against your resume.',
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
    summary: 'Where the job market is moving, from real listings and official statistics.',
    description:
      'A job-market dashboard inside Prottoy: most-demanded skills with two-week trends, companies hiring, locations, work modes, weekly momentum and posted salaries, computed from real open listings, alongside official Bangladesh labour statistics from the World Bank API.',
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
    summary:
      "Bangladesh's logistics inefficiency is a fragmented-information problem more than an infrastructure one. Shared shipment data across couriers could cut costs by over a third and lift exports by ~20%.",
    href: 'https://tob.news/why-bangladeshs-logistics-sector-needs-shared-data/',
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
