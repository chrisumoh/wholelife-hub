import { Screen, Card } from '../../components/Screen';

export default function LogScreen() {
  return <Screen title="Log your day" subtitle="Quick-entry flows are coming next">
    <Card emoji="🍽️" title="Food & drinks" body="Add meals, snacks and water in just a few taps." />
    <Card emoji="💪" title="Workout" body="Record a session and review your activity." />
    <Card emoji="❤️" title="Health metrics" body="Track your personal measurements securely." />
  </Screen>;
}
