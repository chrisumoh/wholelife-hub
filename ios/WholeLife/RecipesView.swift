import SwiftUI

// "Recipes & meal plans" and "Food culture" from the web app.
struct RecipesView: View {
    @EnvironmentObject var store: AppStore
    @State private var query = ""
    @State private var region = "mine"
    @State private var slot = ""
    @State private var diet = ""

    private var results: [Dish] {
        let mine = store.state.profile.region
        return Catalog.shared.dishes.filter { d in
            (region == "all" || (region == "mine" ? d.r == mine : d.r == region))
                && (slot.isEmpty || d.s.contains(slot))
                && (diet.isEmpty || d.diet.contains(diet))
                && (query.isEmpty || d.n.localizedCaseInsensitiveContains(query) || d.c.localizedCaseInsensitiveContains(query))
        }
    }

    // Three picks for today, chosen from the profile's region by the day of the year so they change daily.
    private var todaysMenu: [(String, Dish)] {
        let pool = Catalog.shared.dishes.filter { $0.r == store.state.profile.region }
        let day = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        var out: [(String, Dish)] = []
        for (i, s) in Tables.slots.enumerated() {
            let options = pool.filter { $0.s.contains(s.id) }
            if !options.isEmpty { out.append((s.name, options[(day + i * 7) % options.count])) }
        }
        return out
    }

    var body: some View {
        Page(title: "Recipes & meal plans") {
            if !todaysMenu.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Eyebrow("Today's menu", color: Theme.food)
                    Text("From \(Tables.regionName(store.state.profile.region))").font(.title3.bold()).padding(.vertical, 4)
                    ForEach(Array(todaysMenu.enumerated()), id: \.offset) { i, item in
                        NavigationLink { RecipeDetail(dish: item.1) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.0).font(.footnote).foregroundStyle(Theme.gray)
                                    Text(item.1.n).foregroundStyle(.primary).font(.system(size: 17, weight: .semibold))
                                }
                                Spacer()
                                Text("\(item.1.cal) cal").foregroundStyle(Theme.gray).monospacedDigit()
                                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
                            }
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        if i < todaysMenu.count - 1 { Divider() }
                    }
                }
                .card()
            }

            VStack(spacing: 10) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.gray)
                    TextField("Search dishes", text: $query)
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(Theme.field)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                HStack {
                    filterMenu("Region", selection: $region, options: [Option("mine", "My food culture"), Option("all", "All regions")] + Tables.regions)
                    filterMenu("Meal", selection: $slot, options: [Option("", "Any meal")] + Tables.slots)
                }
                filterMenu("Diet", selection: $diet, options: Tables.diets)
            }
            .card()

            Text("\(results.count) dishes").font(.footnote).foregroundStyle(Theme.gray).frame(maxWidth: .infinity, alignment: .leading)

            ForEach(results.prefix(60)) { d in
                NavigationLink { RecipeDetail(dish: d) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(d.n).font(.headline).foregroundStyle(.primary)
                        Text("\(d.c) · \(d.cal) cal · \(d.pr) g protein · \(d.minutes) min").font(.subheadline).foregroundStyle(Theme.gray)
                        Text(d.d).font(.subheadline).foregroundStyle(Theme.gray).lineLimit(2)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
            if results.count > 60 {
                Text("Showing the first 60. Narrow with search or a region.").font(.footnote).foregroundStyle(Theme.gray)
            }
        }
    }

    private func filterMenu(_ title: String, selection: Binding<String>, options: [Option]) -> some View {
        Picker(title, selection: selection) {
            ForEach(options) { o in Text(o.name).tag(o.id) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct RecipeDetail: View {
    @EnvironmentObject var store: AppStore
    let dish: Dish
    @State private var slot = "lunch"
    @State private var logged = false

    var body: some View {
        Page(title: dish.n) {
            VStack(alignment: .leading, spacing: 12) {
                Eyebrow(dish.c, color: Theme.food)
                Text(dish.d).font(.body)
                HStack {
                    stat("Calories", "\(dish.cal)")
                    stat("Protein", "\(dish.pr) g")
                    stat("Time", "\(dish.minutes) min")
                }
                if !dish.diet.isEmpty || !dish.al.isEmpty {
                    HStack {
                        ForEach(dish.diet, id: \.self) { Tag(text: dietName($0)) }
                        ForEach(dish.al, id: \.self) { Tag(text: "Contains \($0)", color: Theme.activity) }
                    }
                }
            }
            .card()

            VStack(alignment: .leading, spacing: 12) {
                Text("Log this meal").font(.title3.bold())
                Picker("Meal", selection: $slot) {
                    ForEach(Tables.slots) { s in Text(s.name).tag(s.id) }
                }
                .pickerStyle(.segmented)
                Button(logged ? "Logged" : "Log \(dish.cal) cal") {
                    store.logMeal(slot: slot, name: dish.n, cal: dish.cal)
                    logged = true
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(logged)
            }
            .card()

            section("Ingredients") {
                ForEach(Array(dish.ing.enumerated()), id: \.offset) { _, i in
                    Text("• \(i)").font(.subheadline)
                }
            }
            section("Steps") {
                ForEach(Array(dish.steps.enumerated()), id: \.offset) { i, s in
                    Text("\(i + 1). \(s)").font(.subheadline)
                }
            }
            if !dish.ways.isEmpty {
                section("Other ways to cook") {
                    ForEach(Array(dish.ways.enumerated()), id: \.offset) { _, w in Text("• \(w)").font(.subheadline) }
                }
            }
            if dish.light != nil || dish.prot != nil {
                section("Make it your own") {
                    if let l = dish.light { Text("Lighter, \(l.cal) cal: \(l.text)").font(.subheadline) }
                    if let p = dish.prot { Text("More protein, \(p.cal) cal: \(p.text)").font(.subheadline) }
                }
            }
            if !dish.pair.isEmpty { section("Serve with") { Text(dish.pair).font(.subheadline) } }
            if !dish.mp.isEmpty { section("Meal prep") { Text(dish.mp).font(.subheadline) } }
        }
        .onAppear {
            if let first = dish.s.first, Tables.slots.contains(where: { $0.id == first }) { slot = first }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(Theme.gray)
            Text(value).font(.system(size: 20, weight: .bold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dietName(_ id: String) -> String {
        Tables.diets.first { $0.id == id }?.name ?? id
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        let body = content()
        return VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title3.bold())
            body
        }
        .card()
    }
}

struct CultureView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        Page(title: "Food culture") {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow("Your food culture", color: Theme.water)
                Text(Tables.regionName(store.state.profile.region)).font(.title2.bold())
                Text("Meal ideas, the daily menu and the coach start from this region. West African dishes lead the catalog.")
                    .font(.subheadline).foregroundStyle(Theme.gray)
            }
            .card()

            VStack(spacing: 0) {
                ForEach(Array(Tables.regions.enumerated()), id: \.element.id) { i, r in
                    let count = Catalog.shared.dishes.filter { $0.r == r.id }.count
                    Button {
                        store.state.profile.region = r.id
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.name).foregroundStyle(.primary)
                                Text("\(count) dishes").font(.subheadline).foregroundStyle(Theme.gray)
                            }
                            Spacer()
                            if store.state.profile.region == r.id {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                        .padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                    if i < Tables.regions.count - 1 { Divider() }
                }
            }
            .card()
        }
    }
}
