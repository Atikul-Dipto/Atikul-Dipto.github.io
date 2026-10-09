/**
 * Shared between the camera rig and anything clickable in the scene. A
 * drag-to-look gesture ends with a pointerup over whatever you happened to be
 * facing, which R3F reports as a click — so the airlock would open every time
 * you turned round. The rig sets this while a look gesture is in progress and
 * clears it a tick after the gesture ends.
 */
export const gesture = { dragging: false }

/** True if this pointer event is the tail of a look gesture, not a real click. */
export const isDragEnd = () => gesture.dragging
