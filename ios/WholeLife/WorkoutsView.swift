import SwiftUI

struct WorkoutsView: View {
    var body: some View {
        Page(title: "Workouts") {
            VStack(alignment: .leading, spacing: 12) {
                Text("This week").font(.headline).foregroundStyle(Theme.activity)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(Int(Sample.weeklyMinutes.reduce(0, +)))").font(.system(size: 34, weight: .bold)).monospacedDigit()
                    Text("min").foregroundStyle(Theme.gray)
                }
                MiniBars(values: Sample.weeklyMinutes, color: Theme.activity)
                Text("Weekly goal: 4 workouts · 4 done").font(.subheadline).foregroundStyle(Theme.gray)
                ProgressBar(fraction: 1.0, color: Theme.activity)
            }
            .card()

            SectionTitle("Recent")
            ForEach(Sample.workouts) { w in
                HStack(spacing: 14) {
                    Image(systemName: w.symbol)
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.activity)
                        .frame(width: 48, height: 48)
                        .background(Theme.activity.opacity(0.15))
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(w.name).font(.headline)
                        Text("\(w.day) · \(w.minutes) min").font(.subheadline).foregroundStyle(Theme.gray)
                    }
                    Spacer()
                    Text("\(w.calories) kcal").font(.subheadline.weight(.semibold))
                }
                .card()
            }
        }
    }
}
