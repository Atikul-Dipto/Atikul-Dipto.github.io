export const profile = {
  name: 'Atikul Islam',
  title: 'Data Analyst',
  tagline: 'Turning large, messy datasets into decisions people can act on.',
  location: 'Dhaka, Bangladesh',
  stats: [
    { value: '10M+', label: 'daily records analyzed' },
    { value: '3', label: 'dashboard systems built' },
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
    { text: 'KPI dashboards', emphasis: true },
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
    title: 'Logistics Operations Portal',
    description: 'A multi-page Streamlit dashboard for a synthetic Bangladesh e-commerce logistics network — shipment tracking, inventory, and delivery analytics across 5 warehouses and 5 couriers.',
    tags: ['Python', 'Streamlit', 'Pandas', 'Plotly'],
    href: 'https://github.com/Atikul-Dipto/logistics-portal',
    demoHref: null,
    placeholder: false,
  },
  {
    title: 'Live Logistics Flow Map',
    description: 'A standalone React + D3 companion to the Logistics Operations Portal — animates real shipment lane volumes as moving particles across a Bangladesh map, with live DBSCAN hotspot clustering and graph centrality ranking, all client-side.',
    tags: ['React', 'D3', 'Canvas', 'DBSCAN'],
    href: 'https://github.com/Atikul-Dipto/logistics-flow-map',
    demoHref: 'https://atikul-dipto.github.io/logistics-flow-map/',
    placeholder: false,
  },
  {
    title: 'Third project slot',
    description: 'Keep this one for something exploratory — a side analysis, a data viz experiment, or your first step into the supply chain analytics space below.',
    tags: ['Analysis'],
    href: null,
    placeholder: true,
  },
]

export const futurePath = {
  heading: "What's Next: Supply Chain",
  body: "Alongside data analytics, I'm building a foundation in Supply Chain Management — procurement, logistics, demand planning, and inventory strategy. It's a natural extension of the KPI and operational work I already do: the same instinct for finding signal in messy data applies directly to forecasting demand, spotting bottlenecks, and optimizing how goods and information move. Over the coming months I'll be studying core SCM fundamentals and looking for ways to apply my analytics toolkit — SQL, dashboards, Python — to real supply chain problems.",
}
