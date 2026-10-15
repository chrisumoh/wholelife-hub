import SwiftUI
import Charts

// "Daily nutrition" on the web: today card, log a meal, meals list, last 7 days, log weight.
struct MealsView: View {
    @EnvironmentObject var store: AppStore
    @State private var date = Dates.today()
    @State private var slot = "lunch"
    @State private var name = ""
    @State private var cal = ""
    @State private var portion = 1.0
    @State private var picked: Dish?
    @State private var showPicker = false
    @State private var weightText = ""

    private let portionValues: [Double] = [0.5, 0.75, 1, 1.5, 2]
    private let portionNames = ["Half portion", "Smaller portion", "Regular portion", "Large portion", "Double portion"]

    private var isToday: Bool { date == store.today }
    private var dayLabel: String { isToday ? "Today" : Dates.long(date) }

    var body: some View {
        Page(title: "Daily nutrition") {
            todayCard
            logCard
            glanceCard
            mealsCard
            SnacksSummaryCard(date: date)
            weekCard
            weightCard
        }
        .sheet(isPresented: $showPicker) {
            DishPicker { dish in
                picked = dish
                name = dish.n
                if !dish.s.contains(slot), let first = dish.s.first, Tables.slots.contains(where: { $0.id == first }) { slot = first }
                updateCal()
            }
        }
    }

    // ---- cards ----

    private var todayCard: some View {
        let eaten = store.intake(on: date)
        let goal = store.state.profile.calorieGoal
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                CategoryLabel(symbol: "fork.knife", name: "Calories eaten", color: Theme.food)
                Spacer()
                Text(dayLabel).font(.system(size: 15)).foregroundStyle(Theme.gray)
            }
            BigNumber(value: eaten.formatted(), unit: "of \(goal.formatted()) cal")
            ProgressBar(fraction: Double(eaten) / Double(max(goal, 1)), color: Theme.food)
            HStack {
                dayButton(-1, "chevron.left", "Previous day")
                Spacer()
                dayButton(1, "chevron.right", "Next day").disabled(isToday)
            }
        }
        .card()
    }

    private func slotIndex(_ id: String) -> Int {
        Tables.slots.firstIndex { $0.id == id } ?? 9
    }

    private func dayButton(_ delta: Int, _ symbol: String, _ label: String) -> some View {
        Button {
            let next = Dates.add(date, delta)
            if next <= store.today { date = next }
        } label: {
            Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).frame(width: 44, height: 36)
        }
        .buttonStyle(SoftButtonStyle())
        .accessibilityLabel(label)
    }

    private var logCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Log a meal").font(.title3.bold())
            Picker("Meal", selection: $slot) {
                ForEach(Tables.slots) { s in Text(s.name).tag(s.id) }
            }
            .pickerStyle(.segmented)

            Button {
                showPicker = true
            } label: {
                HStack {
                    Image(systemName: "magnifyingglass")
                    Text(picked == nil ? "Search the food catalog" : "Change dish")
                    Spacer()
                }
            }
            .buttonStyle(SoftButtonStyle())

            Field(title: "What did you eat?", text: $name, placeholder: "Start typing: jollof, waakye, egusi…")
            HStack(spacing: 12) {
                Field(title: "Calories", text: $cal, placeholder: "From the catalog", numeric: true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Portion").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
                    Picker("Portion", selection: $portion) {
                        ForEach(portionValues.indices, id: \.self) { i in Text(portionNames[i]).tag(portionValues[i]) }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(Theme.field)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .onChange(of: portion) { _, _ in updateCal() }
                }
            }
            Button("Log meal") { logMeal() }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            Text("Pick a dish and the calories fill in for you. Change the portion and they follow.")
                .font(.footnote).foregroundStyle(Theme.gray)
        }
        .card()
    }

    private var glanceCard: some View {
        let meals = store.meals(on: date).map { $0.cal }.reduce(0, +)
        let snacks = store.snacks(on: date).map { $0.cal }.reduce(0, +)
        return VStack(alignment: .leading, spacing: 12) {
            Text("\(dayLabel) at a glance").font(.title3.bold())
            HStack {
                stat("Meals", meals)
                stat("Snacks", snacks)
                stat("Total", meals + snacks)
            }
            if store.burned(on: date) > 0 {
                Text("Estimated burn: \(store.burned(on: date).formatted()) cal from \(store.workouts(on: date).count) workout\(store.workouts(on: date).count == 1 ? "" : "s").")
                    .font(.footnote).foregroundStyle(Theme.gray)
            }
        }
        .card()
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(Theme.gray)
            Text(value.formatted()).font(.system(size: 24, weight: .bold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var mealsCard: some View {
        let meals = store.meals(on: date).sorted { slotIndex($0.slot) < slotIndex($1.slot) }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Meals on \(isToday ? "today" : Dates.long(date))").font(.title3.bold())
                Spacer()
                Text("\(meals.map { $0.cal }.reduce(0, +).formatted()) cal").font(.subheadline).foregroundStyle(Theme.gray).monospacedDigit()
            }
            .padding(.bottom, 8)
            if meals.isEmpty {
                EmptyNote(text: "No meals logged\(isToday ? " yet today" : ""). Log one above, or browse your food culture for ideas.")
            }
            ForEach(Array(meals.enumerated()), id: \.element.id) { i, m in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Eyebrow(Tables.slots.first { $0.id == m.slot }?.name ?? m.slot, color: Theme.food)
                        Text(m.name).font(.system(size: 17, weight: .semibold))
                    }
                    Spacer()
                    Text("\(m.cal)").font(.system(size: 17, weight: .bold)).monospacedDigit()
                    Button {
                        store.deleteMeal(m)
                    } label: {
                        Image(systemName: "trash").foregroundStyle(Theme.bad).frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(m.name)")
                }
                .padding(.vertical, 10)
                if i < meals.count - 1 { Divider() }
            }
        }
        .card()
    }

    private var weekCard: some View {
        let data = store.series("calories", days: 7)
        let goal = store.state.profile.calorieGoal
        return VStack(alignment: .leading, spacing: 10) {
            Text("Last 7 days").font(.title3.bold())
            Chart {
                ForEach(Array(data.enumerated()), id: \.offset) { i, p in
                    BarMark(x: .value("Day", Dates.weekday(p.date)), y: .value("Calories", p.value ?? 0))
                        .foregroundStyle(i == data.count - 1 ? Theme.food : Theme.gray.opacity(0.35))
                        .cornerRadius(4)
                }
                RuleMark(y: .value("Target", goal))
                    .foregroundStyle(Theme.gray)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
            .frame(height: 140)
            Text("Dashed line: your daily target of \(goal.formatted()) cal.").font(.footnote).foregroundStyle(Theme.gray)
        }
        .card()
    }

    private var weightCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Log your weight").font(.title3.bold())
            Field(title: store.state.profile.metric ? "Weight (kg)" : "Weight (lb)", text: $weightText, placeholder: store.latestWeight.map { String(format: "%.1f", store.state.profile.metric ? $0.kg : $0.kg * 2.20462) } ?? "", numeric: true)
            Button("Save weight") {
                let v = Double(weightText.replacingOccurrences(of: ",", with: ".")) ?? 0
                if v > 0 {
                    store.logWeight(kg: store.state.profile.metric ? v : v / 2.20462)
                    weightText = ""
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            ForEach(store.state.weights.sorted { $0.date > $1.date }.prefix(5)) { w in
                Divider()
                InfoRow(label: Dates.long(w.date), value: store.weightText(w.kg))
            }
        }
        .card()
    }

    // ---- actions ----

    private func updateCal() {
        if let d = picked { cal = String(Int((Double(d.cal) * portion).rounded())) }
    }

    private func logMeal() {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        let c = Int(cal) ?? picked.map { Int((Double($0.cal) * portion).rounded()) } ?? 0
        store.logMeal(slot: slot, name: n, cal: c, date: date)
        name = ""
        cal = ""
        picked = nil
        portion = 1
    }
}

// Today's snacks, shown under the meals (the web keeps snacks in the same day).
struct SnacksSummaryCard: View {
    @EnvironmentObject var store: AppStore
    let date: String

    var body: some View {
        let snacks = store.snacks(on: date)
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Snacks").font(.title3.bold())
                Spacer()
                NavigationLink { SnacksView() } label: { Text("Log a snack").font(.system(size: 15, weight: .semibold)) }
            }
            .padding(.bottom, 8)
            if snacks.isEmpty { EmptyNote(text: "No snacks logged.") }
            ForEach(Array(snacks.enumerated()), id: \.element.id) { i, s in
                HStack {
                    Text(s.name)
                    Spacer()
                    Text("\(s.cal) cal").foregroundStyle(Theme.gray).monospacedDigit()
                    Button { store.deleteSnack(s) } label: {
                        Image(systemName: "trash").foregroundStyle(Theme.bad).frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(s.name)")
                }
                .padding(.vertical, 6)
                if i < snacks.count - 1 { Divider() }
            }
        }
        .card()
    }
}

// Searchable catalog sheet. Text only, West African first (CLAUDE.md sections 3 and 4).
struct DishPicker: View {
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var region = "all"
    let onPick: (Dish) -> Void

    private var results: [Dish] {
        Catalog.shared.dishes.filter { d in
            (region == "all" || d.r == region)
                && (query.isEmpty || d.n.localizedCaseInsensitiveContains(query) || d.c.localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Region", selection: $region) {
                        Text("All regions").tag("all")
                        ForEach(Tables.regions) { r in Text(r.name).tag(r.id) }
                    }
                }
                Section("\(results.count) dishes") {
                    ForEach(results) { d in
                        Button {
                            onPick(d)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(d.n).foregroundStyle(.primary)
                                Text("\(d.c) · \(d.cal) cal").font(.subheadline).foregroundStyle(Theme.gray)
                            }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Search jollof, waakye, egusi…")
            .navigationTitle("Food catalog")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
