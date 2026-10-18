/**
 * Poems and writings, for the room on the recreation level.
 *
 * Only the owner's own words go here, exactly as given. Until there are any,
 * the room and its lectern say the collection is being gathered; nothing is
 * written to fill the space.
 */
export interface Writing {
  id: string
  title: string
  /** 'poem', 'essay', 'note' -- shown over the title. */
  kind: string
  /** The text, with its own line breaks kept. */
  body: string
  /** As the author dates it, if at all. */
  date?: string
  /** The language it is written in, for the reading panel: 'en', 'bn'. */
  lang?: string
}

export const WRITINGS: Writing[] = []
