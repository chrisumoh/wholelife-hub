import { Screen, Card } from '../../components/Screen';

export default function HomeScreen() {
  return <Screen title="Your day, your pace" subtitle="WholeLife Hub · Daily overview">
    <Card emoji="🌿" title="Welcome home" body="Your personalized daily summary will appear here after sign-in and secure sync are implemented." />
    <Card emoji="🥗" title="Nutrition" body="View your meals, snacks and hydration at a glance." />
    <Card emoji="🏃" title="Movement" body="Stay on top of workouts and activity goals." />
    <Card emoji="✨" title="Your coach" body="A dedicated space for wellness guidance and check-ins." />
  </Screen>;
}
