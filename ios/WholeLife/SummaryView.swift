import SwiftUI

struct SummaryView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        Page(title: "Summary") {
            Text("Good evening, \(store.name)")
                .font(.subheadline)
                .foregroundStyle(Theme.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            SectionTitle("Pinned")

            MetricCard(icon: "fork.knife", name: "Calories eaten", color: Theme.food,
                       value: "\(store.eatenCalories)", unit: "kcal",
                       note: "\(Sample.calorieTarget - store.eatenCalories) left of \(Sample.calorieTarget)",
                       bars: Sample.weeklyCalories)

            NavigationLink { NutritionView() } label: {
                MetricCard(icon: "list.bullet.rectangle", name: "Meals", color: Theme.food,
                           value: "\(store.plannedCalories)", unit: "kcal",
                           note: "\(store.meals.count) planned · \(store.meals.filter { $0.logged }.count) logged",
                           bars: store.meals.map { Double($0.calories) })
            }
            .buttonStyle(.plain)

            HStack(spacing: 12) {
                MetricCard(icon: "drop.fill", name: "Water", color: Theme.water,
                           value: "\(store.waterML)", unit: "mL")
                MetricCard(icon: "figure.walk", name: "Steps", color: Theme.activity,
                           value: "\(store.steps)", unit: "")
            }

            MetricCard(icon: "scalemass.fill", name: "Weight", color: Theme.coach,
                       value: store.weightText, unit: store.weightUnit,
                       note: "Down 0.7 kg this week",
                       bars: Sample.weeklyWeight.map { $0 - 80 })

            MetricCard(icon: "flame.fill", name: "Workouts", color: Theme.activity,
                       value: "\(Int(Sample.weeklyMinutes.reduce(0, +)))", unit: "min",
                       note: "This week · 5 of 7 days",
                       bars: Sample.weeklyMinutes)

            SectionTitle("Highlights")
            HStack(spacing: 12) {
                Image(systemName: "sparkles").foregroundStyle(Theme.coach)
                Text(Sample.coachAdvice[0]).font(.system(size: 15))
            }
            .card()
        }
    }
}
