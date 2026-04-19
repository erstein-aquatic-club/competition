type Props = {
  athleteId?: number | null;
  athleteName?: string | null;
  onBack?: () => void;
};

export default function CoachSwimmerQuickView(_props: Props = {}) {
  return <div className="p-4">QuickView (work in progress)</div>;
}
