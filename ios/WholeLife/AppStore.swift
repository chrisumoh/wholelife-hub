import SwiftUI

// Shared screen state. Plays the role of the web app's S and UI objects.
final class AppStore: ObservableObject {
    @Published var meals: [Meal] = Sample.meals
    @Published var waterML: Int = 1400
    @Published var steps: Int = 4100
    @Published var weightKg: Double = 80.7
    @Published var coachIndex: Int = 0
    @Published var culture: String = "Ghanaian"
    @Published var name: String = "CJ"
    @Published var useMetric: Bool = true

    var eatenCalories: Int {
        meals.filter { $0.logged }.map { $0.calories }.reduce(0, +)
            + Sample.snacks.map { $0.calories }.reduce(0, +)
    }

    var plannedCalories: Int { meals.map { $0.calories }.reduce(0, +) }

    func toggle(_ meal: Meal) {
        guard let i = meals.firstIndex(where: { $0.id == meal.id }) else { return }
        meals[i].logged.toggle()
    }

    func addWater(_ ml: Int) { waterML = min(waterML + ml, 6000) }

    var weightText: String {
        useMetric ? String(format: "%.1f", weightKg) : String(format: "%.1f", weightKg * 2.20462)
    }
    var weightUnit: String { useMetric ? "kg" : "lb" }
}
