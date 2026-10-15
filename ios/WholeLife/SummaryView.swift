import SwiftUI
import Charts

struct SummaryView: View {
    @EnvironmentObject var store: AppStore

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
        return "\(part), \(store.state.profile.name)"
    }

    var body: some View {
        Page(title: "Summary") {
            profileStrip
            ringsCard

            SectionTitle("Pinned")
            pinned

            SectionTitle("Trends")
            TrendCard(metric: "calories")
            TrendCard(metric: "steps")
            NavigationLink { HealthView() } label: {
                HStack {
                    Text("Show All Trends").foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
                }
                .card()
            }
            .buttonStyle(.plain)

            SectionTitle("Highlights")
            highlights
        }
    }

    private var profileStrip: some View {
        HStack(spacing: 12) {
            Text(String(store.state.profile.name.prefix(1)).uppercased())
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.tint)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(greeting).font(.headline)
                Text(store.lastUpdated).font(.footnote).foregroundStyle(Theme.gray)
            }
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "flame.fill")
                Text("\(store.streak)d").monospacedDigit()
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.activity)
        }
        .card()
    }

    private var ringsCard: some View {
        let rings = store.rings()
        let closed = rings.filter { $0.closed }.count
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Eyebrow("Today at a glance")
                    Text(closed == 3 ? "All three closed" : closed > 0 ? "\(closed) of 3 closed" : "Your rings").font(.title2.bold())
                }
                Spacer()
                NavigationLink { AwardsView() } label: {
                    Label("Achievements", systemImage: "trophy.fill").font(.system(size: 14, weight: .semibold))
                }
                .buttonStyle(SoftButtonStyle())
            }
            HStack(alignment: .center, spacing: 16) {
                RingsDial(rings: rings, size: 130)
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(rings) { r in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Image(systemName: r.symbol).font(.system(size: 13, weight: .semibold))
                                Text(r.name).font(.system(size: 15, weight: .semibold))
                                if r.closed { Tag(text: "closed") }
                            }
                            .foregroundStyle(r.color)
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                Text(Int(r.value).formatted()).font(.system(size: 17, weight: .bold)).monospacedDigit()
                                Text("/ \(Int(r.goal).formatted()) \(r.unit)").font(.system(size: 13)).foregroundStyle(Theme.gray)
                            }
                            ProgressBar(fraction: r.fraction, color: r.color)
                        }
                    }
                }
            }
        }
        .card()
    }

    private var pinned: some View {
        VStack(spacing: 12) {
            link("calories") {
                MetricCard(symbol: "fork.knife", name: "Calories eaten", color: Theme.food,
                           value: Int(store.value("calories", on: store.today) ?? 0).formatted(), unit: "cal",
                           note: "\(max(store.state.profile.calorieGoal - store.intake(on: store.today), 0)) left of \(store.state.profile.calorieGoal)",
                           bars: store.bars("calories"))
            }
            HStack(spacing: 12) {
                link("water") { small("drop.fill", "Water", Theme.water, store.vitals(on: store.today).water.map { $0.formatted() } ?? "No Data", "mL") }
                link("steps") { small("figure.walk", "Steps", Theme.activity, store.vitals(on: store.today).steps.map { $0.formatted() } ?? "No Data", "") }
            }
            link("weight") {
                MetricCard(symbol: "scalemass.fill", name: "Weight", color: Theme.coach,
                           value: store.latest("weight").map { store.format("weight", $0.value) } ?? "No Data",
                           unit: store.latest("weight") == nil ? "" : store.unit("weight"),
                           note: store.latest("weight").map { "Weighed \(Dates.short($0.date))" },
                           bars: weightBars)
            }
            link("workouts") {
                MetricCard(symbol: "dumbbell.fill", name: "Workouts", color: Theme.activity,
                           value: "\(store.weekMinutes)", unit: "min",
                           note: "This week · \(store.weekWorkouts.count) of \(store.state.profile.workoutGoal) workouts",
                           bars: store.bars("workouts"), stamp: "This week")
            }
            HStack(spacing: 12) {
                link("sleep") { small("bed.double.fill", "Sleep", Theme.sleep, store.latest("sleep").map { store.format("sleep", $0.value) } ?? "No Data", "hr") }
                link("rhr") { small("heart.fill", "Resting HR", Theme.heart, store.latest("rhr").map { store.format("rhr", $0.value) } ?? "No Data", "BPM") }
            }
        }
    }

    // Bars measured from just under the lowest weight so small changes show.
    private var weightBars: [Double] {
        let w = Array(store.bars("weight", days: 30).filter { $0 > 0 }.suffix(7))
        let lo = (w.min() ?? 0) - 1
        return w.map { $0 - lo }
    }

    private func link<V: View>(_ metric: String, @ViewBuilder _ label: () -> V) -> some View {
        let content = label()
        return NavigationLink {
            MetricDetailView(metric: metric)
        } label: {
            content
        }
        .buttonStyle(.plain)
    }

    private func small(_ symbol: String, _ name: String, _ color: Color, _ value: String, _ unit: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CategoryLabel(symbol: symbol, name: name, color: color).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 32)
            BigNumber(value: value, unit: unit, size: value == "No Data" ? 20 : 28)
        }
        .card()
    }

    private var highlights: some View {
        VStack(spacing: 0) {
            if store.streak > 0 {
                highlightRow("stopwatch.fill", Theme.coach, "Workout streak", "\(store.streak) day\(store.streak == 1 ? "" : "s") in a row")
                Divider()
            }
            let ws = store.state.weights.sorted { $0.date < $1.date }
            if ws.count >= 2, let first = ws.first, let last = ws.last {
                let diff = last.kg - first.kg
                let word = abs(diff) < 0.2 ? "holding steady" : diff < 0 ? "down" : "up"
                highlightRow("chart.line.uptrend.xyaxis", Color.accentColor, "Weight trend",
                             "\(word) \(abs(diff) < 0.2 ? "" : store.weightText(abs(diff))) since \(Dates.short(first.date))")
                Divider()
            }
            highlightRow("sparkles", Theme.gold, "Your coach", "Open your coach for today's advice")
        }
        .card()
    }

    private func highlightRow(_ symbol: String, _ color: Color, _ title: String, _ body: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 20)).foregroundStyle(color).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 17, weight: .semibold))
                Text(body).font(.subheadline).foregroundStyle(Theme.gray)
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }
}

// A 7-day chart card used in Trends.
struct TrendCard: View {
    @EnvironmentObject var store: AppStore
    let metric: String

    var body: some View {
        let def = Metrics.def(metric)
        let data = store.series(metric, days: 7)
        return NavigationLink {
            MetricDetailView(metric: metric)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    CategoryLabel(symbol: def.symbol, name: def.name, color: def.color)
                    Spacer()
                    Text("7 days").font(.system(size: 15)).foregroundStyle(Theme.gray)
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
                }
                Chart {
                    ForEach(Array(data.enumerated()), id: \.offset) { i, p in
                        BarMark(x: .value("Day", Dates.weekday(p.date)), y: .value(def.name, p.value ?? 0))
                            .foregroundStyle(i == data.count - 1 ? def.color : Theme.gray.opacity(0.35))
                            .cornerRadius(4)
                    }
                }
                .chartYAxis(.hidden)
                .frame(height: 110)
            }
            .card()
        }
        .buttonStyle(.plain)
    }
}
