import SwiftUI

struct AwardsView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        let badges = store.badges
        let earned = badges.filter { $0.earned }.count
        return Page(title: "Achievements & Goals") {
            VStack(alignment: .leading, spacing: 14) {
                Eyebrow("Achievements & Goals", color: Theme.gold)
                Text("\(earned) of \(badges.count) earned").font(.title2.bold())
                Text("Badges come from what you've actually logged, so they can't be faked or reset by accident.")
                    .font(.subheadline).foregroundStyle(Theme.gray)
                HStack {
                    stat("Current streak", "\(store.streak) day\(store.streak == 1 ? "" : "s")")
                    stat("Best streak", "\(store.bestStreak) days")
                }
                HStack {
                    stat("Workouts logged", "\(store.state.workouts.count)")
                    stat("This week", "\(store.weekWorkouts.count) of \(store.state.profile.workoutGoal)")
                }
            }
            .card()

            SectionTitle("Badges")
            ForEach(badges) { b in
                HStack(spacing: 14) {
                    Image(systemName: b.symbol)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(b.earned ? Color.white : Theme.gray)
                        .frame(width: 52, height: 52)
                        .background(b.earned ? AnyShapeStyle(Theme.awardsTile) : AnyShapeStyle(Theme.gray.opacity(0.15)))
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(b.name).font(.system(size: 17, weight: .semibold))
                            if b.earned { Tag(text: "Earned", color: Theme.gold) }
                        }
                        Text(b.detail).font(.subheadline).foregroundStyle(Theme.gray)
                        if !b.earned { ProgressBar(fraction: b.progress, color: Theme.gold) }
                    }
                }
                .card()
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(Theme.gray)
            Text(value).font(.system(size: 20, weight: .bold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
