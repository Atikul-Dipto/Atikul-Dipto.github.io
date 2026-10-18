import { FLOORS, floorByLevel } from './floors'
import {
  certifications,
  dashboards,
  education,
  experience,
  identity,
  profile,
  projects,
  skillGroups,
  sqlQueries,
  writing,
  type ExperienceRecord,
} from './portfolio'

/**
 * What each level holds, as one structure read twice: by the wall display on
 * that level and by the HTML record panel. The wall shows what can be read
 * standing in front of it; the panel carries everything, including the links
 * and the SQL, and is what a screen reader or a phone gets.
 *
 * Nothing here is written for the silo. Every string comes from
 * `portfolio.ts`, which is copied from the standard portfolio.
 */

export interface RecordLink {
  label: string
  href: string
}

export interface RecordItem {
  title?: string
  /** A short line under the title: dates, an organisation, a dataset. */
  meta?: string
  text?: string
  bullets?: string[]
  tags?: string[]
  /** Big numbers, shown as a row of figures. */
  figures?: Array<[string, string]>
  links?: RecordLink[]
  /** Code, for the panel only: it is unreadable at wall scale. */
  code?: string
  /** Leave this item off the wall; the panel still shows it. */
  panelOnly?: boolean
}

export interface RecordSection {
  heading?: string
  items: RecordItem[]
}

export interface LevelRecord {
  level: number
  kicker: string
  title: string
  subtitle?: string
  sections: RecordSection[]
  /** True when there is nothing on record for this level yet. */
  empty?: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return m ? `${MONTHS[m - 1]} ${y}` : String(y)
}
export const period = (e: { start: string; end?: string }) => `${month(e.start)} — ${e.end ? month(e.end) : 'Present'}`

const posting = (e: ExperienceRecord): RecordSection[] => [
  {
    items: [
      {
        // The role is the record's subtitle already.
        meta: [e.orgNote, period(e), e.location].filter(Boolean).join('  ·  '),
        bullets: [...e.responsibilities, ...(e.achievements ?? [])],
        tags: e.tools,
        links: e.orgUrl ? [{ label: e.org, href: e.orgUrl }] : undefined,
      },
    ],
  },
]

function build(level: number): Omit<LevelRecord, 'level' | 'kicker'> {
  const floor = floorByLevel(level)
  switch (floor.kind) {
    case 'monitoring':
      return {
        title: identity.name,
        subtitle: `${profile.title}  ·  ${identity.location}`,
        sections: [
          {
            items: [
              { text: profile.tagline },
              { figures: profile.stats.map((s) => [s.value, s.label]) },
              { text: profile.bio },
              { tags: identity.specialisms },
              { links: identity.links, panelOnly: true },
            ],
          },
        ],
      }
    case 'careers':
      return {
        title: 'Careers',
        subtitle: 'Three rooms, one for each posting; the current one is lit',
        sections: experience.map((e) => ({ heading: `${e.org}  ·  ${e.role}`, items: posting(e)[0].items })),
      }
    case 'skills':
      return {
        title: 'Skills',
        subtitle: 'Three rooms: the tools, the analysis, and working with people',
        sections: [
          ...skillGroups.software.map((g) => ({ heading: `Tools  ·  ${g.group}`, items: [{ tags: g.items }] })),
          ...skillGroups.analytics.map((g) => ({ heading: `Analytics  ·  ${g.group}`, items: [{ tags: g.items }] })),
          ...skillGroups.soft.map((g) => ({ heading: `Soft skills  ·  ${g.group}`, items: [{ tags: g.items }] })),
          {
            heading: 'SQL showcase',
            items: sqlQueries.map((q) => ({
              title: q.title,
              meta: `${q.project}  ·  ${q.dialect}`,
              text: q.question,
              tags: q.techniques,
            })),
          },
          {
            heading: 'The queries',
            items: sqlQueries.map((q) => ({ panelOnly: true, title: q.title, text: q.note, code: q.sql })),
          },
        ],
      }
    case 'laboratory':
      return {
        title: 'Project Laboratory',
        subtitle: 'Projects, and the Power BI case studies',
        sections: [
          {
            heading: 'Projects',
            items: projects.map((p) => ({
              title: p.title,
              text: p.summary,
              tags: p.tags,
              links: [
                ...(p.demo ? [{ label: 'Live demo', href: p.demo }] : []),
                ...(p.repo ? [{ label: 'Source', href: p.repo }] : []),
              ],
            })),
          },
          {
            heading: 'Power BI case studies',
            items: dashboards.map((d) => ({
              title: d.title,
              meta: d.dataset,
              text: d.question,
              figures: d.highlights,
              bullets: d.findings.map((f) => f.headline),
              tags: d.tags,
              links: [{ label: 'PBIP source', href: d.repo }],
            })),
          },
          {
            heading: 'Case study detail',
            items: dashboards.map((d) => ({
              panelOnly: true,
              title: d.title,
              text: d.purpose,
              bullets: [
                ...d.findings.map((f) => `${f.headline}. ${f.detail}`),
                ...d.build.map(([k, v]) => `${k}: ${v}`),
                ...d.caveats,
              ],
            })),
          },
          {
            heading: 'Project detail',
            items: projects.map((p) => ({ panelOnly: true, title: p.title, text: p.description })),
          },
        ],
      }
    case 'education':
      return {
        title: 'Education Archive',
        subtitle: 'The degree, and published writing',
        sections: [
          {
            heading: 'Education',
            items: education.map((d) => ({
              title: d.qualification,
              meta: `${d.institution}  ·  ${d.start} — ${d.end}`,
              text: 'Coursework',
              tags: d.coursework,
            })),
          },
          {
            heading: 'Published writing',
            items: writing.map((w) => ({
              title: w.title,
              meta: `${w.kind ? `${w.kind}, ` : ''}${w.publication}  ·  ${w.dateLabel ?? w.date}`,
              text: w.summary,
              tags: w.tags,
              links: [{ label: 'Read it', href: w.href }],
            })),
          },
        ],
      }
    case 'certification':
      return {
        title: 'Certification Archive',
        sections: [
          {
            items: certifications.map((c) => ({ title: c.name, meta: c.issuer })),
          },
        ],
      }
    case 'recreation':
      return {
        title: 'Recreation',
        subtitle: 'Nothing professional is hidden here. It is for fun.',
        sections: [
          {
            items: [
              {
                title: 'The maze',
                text: 'A hedge maze right round the floor from the plaza where the bridge lands, with a way in at each end. The map on the plaza shows it all, and follows you. It keeps time, and your best run on this device.',
              },
              {
                title: 'Six round doors',
                text: 'At the back of the maze. Each rolls aside into the wall, and the room behind lights up when you walk in, and goes dark again when you leave and shut it. The rooms are joined to one another inside, out from the chamber both ways.',
              },
              {
                title: 'Game theory',
                text: "The chamber: an orrery under the dome, and the arcade -- Prisoner's Dilemma, the Ultimatum, Stag Hunt and Guess 2/3, one round each and then what it shows about game theory, and Maze Run.",
              },
              {
                title: 'The music hall',
                text: 'Take a cassette from a closet and the gramophone on the stage plays it. The silo’s own score waits until you eject it.',
              },
              {
                title: 'Citizens',
                text: 'Become a citizen of the Silo at the kiosk: your name goes up on the wall, which is one great screen of every citizen’s name, and you get a certificate.',
              },
              {
                title: 'Poems and writings',
                text: 'A reading room with a lectern. The collection is still being gathered.',
              },
              {
                title: 'Drone control',
                text: 'Fly the drone round the silo for a minute, or race it through twelve gates down the shaft.',
              },
              {
                title: 'The aim range',
                text: 'Thirty seconds of targets past the rail; quick hits score more. The best score is kept on this device.',
              },
            ],
          },
        ],
      }
    case 'core':
      return {
        title: 'Communications',
        subtitle: 'Deep Core',
        sections: [
          {
            items: [
              { title: 'Email', text: identity.email, links: [{ label: 'Write', href: `mailto:${identity.email}` }] },
              ...(identity.phone ? [{ title: 'Phone', text: identity.phone }] : []),
              ...identity.links.map((l) => ({ title: l.label, text: l.href.replace(/^https?:\/\//, '').replace(/\/$/, ''), links: [l] })),
              { title: 'Location', text: identity.location },
            ],
          },
        ],
      }
    default:
      return {
        title: floor.name,
        empty: true,
        sections: [],
      }
  }
}

export function levelRecord(level: number): LevelRecord {
  const floor = floorByLevel(level)
  return {
    level,
    kicker: `Level ${String(floor.level).padStart(2, '0')}  ·  ${floor.name}`,
    ...build(level),
  }
}

export const allRecords = () => FLOORS.map((f) => levelRecord(f.level))
