import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var store: AppStore
    @State private var confirmClear = false

    private var profile: Binding<Profile> {
        Binding(get: { store.state.profile }, set: { store.state.profile = $0 })
    }

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Name", text: profile.name)
                Picker("Units", selection: profile.metric) {
                    Text("Metric (kg, mL)").tag(true)
                    Text("Imperial (lb)").tag(false)
                }
                NavigationLink {
                    CultureView()
                } label: {
                    HStack {
                        Text("Food culture")
                        Spacer()
                        Text(Tables.regionName(store.state.profile.region)).foregroundStyle(Theme.gray)
                    }
                }
            }

            Section("Targets") {
                Stepper("Calories a day: \(store.state.profile.calorieGoal)", value: profile.calorieGoal, in: 1000...5000, step: 50)
                Stepper("Workouts a week: \(store.state.profile.workoutGoal)", value: profile.workoutGoal, in: 1...7)
            }

            Section("Appearance") {
                Picker("Mode", selection: profile.appearance) {
                    Text("Auto").tag(0)
                    Text("Light").tag(1)
                    Text("Dark").tag(2)
                }
                .pickerStyle(.segmented)
                HStack(spacing: 14) {
                    ForEach(swatches.indices, id: \.self) { i in
                        let s = swatches[i]
                        Button {
                            store.state.profile.accent = s.0
                        } label: {
                            Circle().fill(s.1).frame(width: 34, height: 34)
                                .overlay(Circle().stroke(Color.primary, lineWidth: store.state.profile.accent == s.0 ? 3 : 0).padding(-4))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(s.0)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Coach") {
                Picker("Style", selection: profile.coach) {
                    ForEach(Tables.coaches) { c in Text(c.label).tag(c.id) }
                }
            }

            Section("Data on this device") {
                Button("Load a week of sample data") { store.loadSample() }
                Button("Clear everything I logged", role: .destructive) { confirmClear = true }
                Text("This iOS preview keeps everything on your phone. It does not sign in or sync with your account on the website.")
                    .font(.footnote).foregroundStyle(Theme.gray)
            }

            Section("About") {
                LabeledContent("Version", value: "8.2.22 (iOS preview)")
                Link("Open the website", destination: URL(string: "https://wholelife-hub.vercel.app") ?? URL(fileURLWithPath: "/"))
            }
        }
        .navigationTitle("Settings")
        .confirmationDialog("Clear everything you logged?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Clear everything", role: .destructive) { store.clearAll() }
        }
    }

    private var swatches: [(String, Color)] {
        [("blue", Color.blue), ("green", Theme.food), ("gold", Theme.gold), ("coral", Theme.activity), ("purple", Theme.sleep)]
    }
}
