export default function CloneFlow({ onClose }: { onClose(): void }) {
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal glass">Format copying is being built.</div>
    </div>
  )
}
