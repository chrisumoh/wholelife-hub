import SwiftUI

// The web app's sidebar, as a grouped list: Summary, Log, Plan, Progress, Premium, Settings, Legal.
struct MenuView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                        .background(Theme.tile(0x1FA36B, 0x0E8397))
                        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Whole Life Hub").font(.headline)
                        Text("\(store.state.profile.name) · \(Tables.regionName(store.state.profile.region))")
                            .font(.subheadline).foregroundStyle(Theme.gray)
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                row("Summary", "heart.text.square.fill", Theme.summaryTile) { SummaryView() }
            }

            Section("Log") {
                row("Meals", "fork.knife", Theme.mealsTile) { MealsView() }
                row("Snacks", "carrot.fill", Theme.snacksTile) { SnacksView() }
                row("Workouts & imports", "dumbbell.fill", Theme.workoutsTile) { WorkoutsView() }
            }

            Section("Plan") {
                row("Recipes & meal plans", "book.fill", Theme.recipesTile) { RecipesView() }
                row("Food culture", "globe.africa.fill", Theme.cultureTile) { CultureView() }
                row("Personal coach", "stopwatch.fill", Theme.coachTile) { CoachView() }
            }

            Section("Progress") {
                row("Health data", "square.grid.2x2.fill", Theme.healthTile) { HealthView() }
                row("Achievements & Goals", "medal.fill", Theme.awardsTile) { AwardsView() }
            }

            Section {
                row("Go Premium", "crown.fill", Theme.awardsTile) { PremiumView() }
                row("Settings", "gearshape.fill", Theme.settingsTile) { SettingsView() }
            }

            Section("Legal") {
                legal("Privacy Policy", "lock.fill", "privacy-policy")
                legal("Terms", "doc.text.fill", "terms")
                legal("Refunds", "arrow.uturn.backward.circle.fill", "refunds")
                legal("Contact", "envelope.fill", "contact")
                legal("Credits", "heart.fill", "credits")
            }
        }
        .navigationTitle("Menu")
    }

    private func row<D: View>(_ title: String, _ symbol: String, _ fill: LinearGradient, @ViewBuilder dest: () -> D) -> some View {
        let destination = dest()
        return NavigationLink {
            destination
        } label: {
            HStack(spacing: 12) {
                IconTile(symbol: symbol, fill: fill)
                Text(title)
            }
        }
    }

    // Legal pages stay on the website, so there is one copy of the text.
    private func legal(_ title: String, _ symbol: String, _ path: String) -> some View {
        Link(destination: URL(string: "https://wholelife-hub.vercel.app/#/\(path)") ?? URL(fileURLWithPath: "/")) {
            HStack(spacing: 12) {
                IconTile(symbol: symbol, fill: Theme.settingsTile)
                Text(title).foregroundStyle(.primary)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
            }
        }
    }
}
