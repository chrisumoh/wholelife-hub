import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every card in this prototype is a static placeholder. The banner says so on every screen.
export function Screen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <ScrollView
    style={{ backgroundColor: '#f5f8f6', flex: 1 }}
    contentContainerStyle={{ paddingHorizontal: 22, paddingTop: insets.top + 20, paddingBottom: 42 }}
  >
    <Text accessibilityRole="header" style={{ fontSize: 29, fontWeight: '800', color: '#173a32' }}>{title}</Text>
    <Text style={{ fontSize: 14, color: '#4d5f58', marginTop: 5, marginBottom: 14 }}>{subtitle}</Text>
    <View
      accessible
      accessibilityLabel="Prototype. Nothing on this screen is real data and nothing works yet."
      style={{ backgroundColor: '#fff4d6', borderRadius: 12, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: '#f2b33d' }}
    >
      <Text style={{ color: '#5a4100', fontSize: 13, lineHeight: 19 }}>
        Prototype: placeholder cards only. Sign-in, logging and sync are not built yet.
      </Text>
    </View>
    {children}
  </ScrollView>;
}

export function Card({ title, body, emoji }: { title: string; body: string; emoji?: string }) {
  return <View
    accessible
    accessibilityLabel={`Placeholder: ${title}. ${body}`}
    style={{ backgroundColor: 'white', padding: 20, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#e5eee9' }}
  >
    {emoji ? <Text importantForAccessibility="no" accessibilityElementsHidden style={{ fontSize: 23, marginBottom: 8 }}>{emoji}</Text> : null}
    <Text style={{ fontSize: 17, fontWeight: '700', color: '#183e34', marginBottom: 6 }}>{title}</Text>
    <Text style={{ color: '#4d5f58', fontSize: 14, lineHeight: 21 }}>{body}</Text>
  </View>;
}
