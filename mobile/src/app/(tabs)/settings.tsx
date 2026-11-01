import { Screen, Card } from '../../components/Screen';

export default function SettingsScreen() {
  return <Screen title="Settings" subtitle="Make WholeLife Hub yours">
    <Card emoji="👤" title="Account & profiles" body="Manage your account and household profiles." />
    <Card emoji="🔔" title="Notifications" body="Configure reminders and check-ins." />
    <Card emoji="🎨" title="Appearance" body="Choose your theme and accessibility preferences." />
    <Card emoji="🔒" title="Privacy & security" body="Review permissions, session security and data controls." />
    <Card emoji="ℹ️" title="About" body="Version, support, and app information." />
  </Screen>;
}
