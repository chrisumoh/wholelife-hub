import SwiftUI

struct CoachView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        Page(title: "Personal coach") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: "sparkles")
                    Text("Today's advice").font(.system(size: 17, weight: .semibold))
                }
                .foregroundStyle(Theme.coach)
                Text(Sample.coachAdvice[store.coachIndex % Sample.coachAdvice.count])
                    .font(.body)
                Button("Another tip") { store.coachIndex += 1 }
                    .buttonStyle(.bordered)
            }
            .card()

            SectionTitle("Streak")
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("12").font(.system(size: 34, weight: .bold)).monospacedDigit()
                Text("days logged in a row").foregroundStyle(Theme.gray)
            }
            .card()

            SectionTitle("Next action")
            HStack(spacing: 12) {
                Image(systemName: "figure.walk").foregroundStyle(Theme.activity)
                VStack(alignment: .leading, spacing: 2) {
                    Text("20 minute walk").font(.headline)
                    Text("Planned for this evening").font(.subheadline).foregroundStyle(Theme.gray)
                }
            }
            .card()
        }
    }
}
