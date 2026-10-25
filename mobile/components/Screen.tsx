import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

export function Screen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <ScrollView style={{ backgroundColor: '#f5f8f6', flex: 1 }} contentContainerStyle={{ padding: 22, paddingTop: 64, paddingBottom: 42 }}>
    <Text style={{ fontSize: 29, fontWeight: '800', color: '#173a32' }}>{title}</Text>
    <Text style={{ fontSize: 14, color: '#60726b', marginTop: 5, marginBottom: 24 }}>{subtitle}</Text>
    {children}
  </ScrollView>;
}

export function Card({ title, body, emoji }: { title: string; body: string; emoji?: string }) {
  return <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#e5eee9' }}>
    {emoji ? <Text style={{ fontSize: 23, marginBottom: 8 }}>{emoji}</Text> : null}
    <Text style={{ fontSize: 17, fontWeight: '700', color: '#183e34', marginBottom: 6 }}>{title}</Text>
    <Text style={{ color: '#61756b', fontSize: 14, lineHeight: 21 }}>{body}</Text>
  </View>;
}
