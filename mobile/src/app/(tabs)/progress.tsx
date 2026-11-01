import { Screen, Card } from '../../components/Screen';

export default function ProgressScreen() {
  return <Screen title="Your progress" subtitle="Celebrate consistency over perfection">
    <Card emoji="📈" title="Trends" body="Charts for nutrition, activity and health metrics will live here." />
    <Card emoji="🏅" title="Milestones" body="See personal achievements and streaks after data sync is enabled." />
  </Screen>;
}
