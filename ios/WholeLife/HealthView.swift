import SwiftUI
import Charts

// "Health data": every category and metric in one place, as on the web.
struct HealthView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        Page(title: "Health data") {
            ForEach(Metrics.categories) { cat in
                SectionTitle(cat.name)
                VStack(spacing: 0) {
                    let items = Metrics.all.filter { $0.category == cat.id }
                    ForEach(Array(items.enumerated()), id: \.element.id) { i, m in
                        NavigationLink {
                            MetricDetailView(metric: m.id)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: m.symbol).font(.system(size: 18, weight: .semibold)).foregroundStyle(m.color).frame(width: 26)
                                Text(m.name).foregroundStyle(.primary)
                                Spacer()
                                if let l = store.latest(m.id) {
                                    Text("\(store.format(m.id, l.value)) \(store.unit(m.id))").foregroundStyle(Theme.gray).monospacedDigit()
                                } else {
                                    Text("No Data").foregroundStyle(Theme.gray)
                                }
                                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
                            }
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                        if i < items.count - 1 { Divider() }
                    }
                }
                .card()
            }
        }
    }
}

struct MetricDetailView: View {
    @EnvironmentObject var store: AppStore
    let metric: String
    @State private var range = 7
    @State private var a = ""
    @State private var b = ""

    private var def: MetricDef { Metrics.def(metric) }

    // Metrics you can add by hand, with the label for each box.
    private var fields: [String]? {
        switch metric {
        case "water": return ["Water (mL)"]
        case "steps": return ["Steps"]
        case "active": return ["Active calories"]
        case "weight": return [store.state.profile.metric ? "Weight (kg)" : "Weight (lb)"]
        case "rhr": return ["Resting heart rate (BPM)"]
        case "bp": return ["Systolic (top)", "Diastolic (bottom)"]
        case "spo2": return ["Blood oxygen (%)"]
        case "sleep": return ["Hours slept"]
        default: return nil
        }
    }

    var body: some View {
        Page(title: def.name) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    CategoryLabel(symbol: def.symbol, name: def.name, color: def.color)
                    Spacer()
                    if let l = store.latest(metric) { Text(Dates.short(l.date)).font(.system(size: 15)).foregroundStyle(Theme.gray) }
                }
                if let l = store.latest(metric) {
                    BigNumber(value: store.format(metric, l.value), unit: store.unit(metric))
                } else {
                    Text("No Data").font(.system(size: 28, weight: .bold)).foregroundStyle(Theme.gray)
                }
                Picker("Range", selection: $range) {
                    Text("7 days").tag(7)
                    Text("30 days").tag(30)
                }
                .pickerStyle(.segmented)
                chart
            }
            .card()

            if let f = fields {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Add a reading").font(.headline)
                    Field(title: f[0], text: $a, placeholder: "0", numeric: true)
                    if f.count > 1 { Field(title: f[1], text: $b, placeholder: "0", numeric: true) }
                    Button("Save") { save() }
                        .buttonStyle(PrimaryButtonStyle())
                    if metric == "water" || metric == "steps" {
                        Text("Water and steps add to today's total.").font(.footnote).foregroundStyle(Theme.gray)
                    }
                }
                .card()
            }

            let history = store.series(metric, days: 14).reversed().filter { $0.value != nil }
            if !history.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Recent").font(.headline).padding(.bottom, 4)
                    ForEach(Array(history.prefix(7).enumerated()), id: \.offset) { i, p in
                        InfoRow(label: Dates.long(p.date), value: "\(store.format(metric, p.value ?? 0)) \(store.unit(metric))")
                        if i < min(history.count, 7) - 1 { Divider() }
                    }
                }
                .card()
            }

            if let about = Catalog.shared.about[metric] {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow("About")
                    Text(about).font(.subheadline)
                }
                .card()
            }
        }
    }

    private struct Point: Identifiable {
        let id: Int
        let date: Date
        let value: Double
        let latest: Bool
    }

    private var chart: some View {
        let data = store.series(metric, days: range)
        var pts: [Point] = []
        for (i, p) in data.enumerated() {
            if let v = p.value {
                pts.append(Point(id: i, date: Dates.date(p.date), value: convert(v), latest: i == data.count - 1))
            }
        }
        let isLine = metric == "weight" || metric == "rhr" || metric == "spo2" || metric == "bp"
        return Chart {
            ForEach(pts) { p in
                if isLine {
                    LineMark(x: .value("Day", p.date, unit: .day), y: .value(def.name, p.value))
                        .foregroundStyle(def.color)
                        .interpolationMethod(.monotone)
                    PointMark(x: .value("Day", p.date, unit: .day), y: .value(def.name, p.value))
                        .foregroundStyle(def.color)
                } else {
                    BarMark(x: .value("Day", p.date, unit: .day), y: .value(def.name, p.value))
                        .foregroundStyle(p.latest ? def.color : def.color.opacity(0.55))
                        .cornerRadius(3)
                }
            }
        }
        .chartYScale(domain: .automatic(includesZero: !isLine))
        .frame(height: 200)
    }

    private func convert(_ v: Double) -> Double {
        metric == "weight" && !store.state.profile.metric ? v * 2.20462 : v
    }

    private func save() {
        let x = Double(a.replacingOccurrences(of: ",", with: ".")) ?? 0
        let y = Double(b.replacingOccurrences(of: ",", with: ".")) ?? 0
        guard x > 0 else { return }
        switch metric {
        case "water": store.addWater(Int(x))
        case "steps": store.addVital { $0.steps = ($0.steps ?? 0) + Int(x) }
        case "active": store.addVital { $0.active = ($0.active ?? 0) + Int(x) }
        case "weight": store.logWeight(kg: store.state.profile.metric ? x : x / 2.20462)
        case "rhr": store.addVital { $0.rhr = Int(x) }
        case "bp": store.addVital { $0.sys = Int(x); $0.dia = Int(y) }
        case "spo2": store.addVital { $0.spo2 = Int(min(x, 100)) }
        case "sleep": store.addVital { $0.sleep = Int(x * 60) }
        default: break
        }
        a = ""
        b = ""
    }
}
