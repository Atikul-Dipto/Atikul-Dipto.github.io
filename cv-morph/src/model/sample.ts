import { newContact, newEntry, newGroup, newItem, newSection } from './sections.ts'
import type { Cv } from './types.ts'

/** A made-up CV to try the app with: nobody's real details. */
export function sampleCv(): Cv {
  const summary = newSection('summary')
  summary.text =
    'Data analyst with four years of experience turning e-commerce and operations data into decisions. Builds the pipelines, the dashboards and the story around them, and is at ease presenting findings to people who do not read SQL.'

  const experience = newSection('experience')
  experience.entries = [
    newEntry({
      title: 'Senior Data Analyst',
      subtitle: 'Northwind Commerce',
      date: 'Mar 2023 – Present',
      location: 'Dhaka, Bangladesh',
      bullets: [
        'Rebuilt the daily sales reporting in SQL and Power BI, cutting the time to a finished report from 3 hours to 10 minutes.',
        'Analysed 12M+ order records to find where customers dropped out of checkout; the fixes raised conversion by 8%.',
        'Mentored two junior analysts and set up code review for every dashboard query.',
      ],
    }),
    newEntry({
      title: 'Data Analyst',
      subtitle: 'Brightside Logistics',
      date: 'Jan 2021 – Feb 2023',
      location: 'Dhaka, Bangladesh',
      bullets: [
        'Automated weekly KPI reports with Python and pandas, saving the operations team 6 hours a week.',
        'Designed a delivery-delay dashboard used daily by 40 dispatchers across 5 hubs.',
        'Cleaned and validated survey data from 9,000 respondents for a market-entry study.',
      ],
    }),
    newEntry({
      title: 'Research Intern',
      subtitle: 'Civic Data Lab',
      date: 'Jun 2020 – Dec 2020',
      location: 'Remote',
      bullets: ['Audited field survey data for quality and consistency, flagging 300+ records for re-collection.', 'Wrote the methods section of a published report on urban transport.'],
    }),
  ]

  const education = newSection('education')
  education.entries = [
    newEntry({ title: 'BSc in Economics', subtitle: 'Riverside University', date: '2016 – 2020', location: 'Dhaka, Bangladesh', summary: 'Coursework: Econometrics, Statistics, Game Theory. CGPA 3.72 / 4.00' }),
  ]

  const skills = newSection('skills')
  skills.groups = [
    newGroup('Analysis', ['SQL', 'Python (pandas, NumPy)', 'Excel', 'Statistics', 'A/B testing']),
    newGroup('Visualisation', ['Power BI', 'Tableau', 'Metabase']),
    newGroup('Working with people', ['Stakeholder communication', 'Presentation', 'Mentoring']),
  ]

  const projects = newSection('projects')
  projects.entries = [
    newEntry({
      title: 'Price tracker',
      subtitle: 'Personal project',
      date: '2024',
      bullets: ['Scrapes two retailers daily and charts price history for 500 products.', 'PostgreSQL, Python and a React dashboard; 1,200 monthly visitors.'],
    }),
  ]

  const certifications = newSection('certifications')
  certifications.items = [newItem('Google Data Analytics Professional Certificate (2022)'), newItem('Microsoft Power BI Data Analyst Associate (2023)')]

  const languages = newSection('languages')
  languages.groups = [newGroup('', ['English (fluent)', 'Bengali (native)'])]

  return {
    name: 'Maya Rahman',
    headline: 'Data Analyst',
    photo: '',
    contacts: [
      newContact('email', 'maya.rahman@example.com', 'mailto:maya.rahman@example.com'),
      newContact('phone', '+880 1700 000000'),
      newContact('location', 'Dhaka, Bangladesh'),
      newContact('linkedin', 'linkedin.com/in/maya-rahman', 'https://linkedin.com/in/maya-rahman'),
    ],
    sections: [summary, experience, education, skills, projects, certifications, languages],
  }
}
