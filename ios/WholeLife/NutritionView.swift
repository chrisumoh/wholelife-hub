import SwiftUI

struct NutritionView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        Page(title: "Daily nutrition") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(store.eatenCalories)").font(.system(size: 34, weight: .bold)).monospacedDigit()
                    Text("of \(Sample.calorieTarget) kcal").foregroundStyle(Theme.gray)
                }
                ProgressBar(fraction: Double(store.eatenCalories) / Double(Sample.calorieTarget), color: Theme.food)
            }
            .card()

            SectionTitle("Today's meals")
            ForEach(store.meals) { meal in
                Button { store.toggle(meal) } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(meal.slot.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(Theme.food)
                            Text(meal.name).font(.headline).foregroundStyle(.primary)
                            Text(meal.detail).font(.subheadline).foregroundStyle(Theme.gray)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text("\(meal.calories) kcal").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                            Text(meal.logged ? "Logged" : "Tap to log")
                                .font(.caption)
                                .foregroundStyle(meal.logged ? Theme.food : Theme.gray)
                        }
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }

            SectionTitle("Snacks")
            VStack(spacing: 0) {
                ForEach(Array(Sample.snacks.enumerated()), id: \.element.id) { i, s in
                    HStack {
                        Text(s.name)
                        Spacer()
                        Text("\(s.calories) kcal").foregroundStyle(Theme.gray)
                    }
                    .padding(.vertical, 10)
                    if i < Sample.snacks.count - 1 { Divider() }
                }
            }
            .card()

            SectionTitle("Water")
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(store.waterML)").font(.system(size: 34, weight: .bold)).monospacedDigit()
                    Text("of \(Sample.waterGoalML) mL").foregroundStyle(Theme.gray)
                }
                ProgressBar(fraction: Double(store.waterML) / Double(Sample.waterGoalML), color: Theme.water)
                HStack(spacing: 8) {
                    ForEach([250, 500], id: \.self) { ml in
                        Button("+\(ml) mL") { store.addWater(ml) }
                            .buttonStyle(.bordered)
                            .tint(Theme.water)
                    }
                }
            }
            .card()
        }
    }
}
