import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

const accent = '#18766b';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: accent,
      tabBarInactiveTintColor: '#4d5f58',
      tabBarStyle: { backgroundColor: '#ffffff' },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({color, size}) => <Ionicons name="home-outline" color={color as string} size={size} /> }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: ({color, size}) => <Ionicons name="add-circle-outline" color={color as string} size={size} /> }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({color, size}) => <Ionicons name="stats-chart-outline" color={color as string} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({color, size}) => <Ionicons name="settings-outline" color={color as string} size={size} /> }} />
    </Tabs>
  );
}
