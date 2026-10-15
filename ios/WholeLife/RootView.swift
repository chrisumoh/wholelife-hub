import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            NavigationStack { SummaryView() }
                .tabItem { Label("Summary", systemImage: "heart.text.square.fill") }
            NavigationStack { NutritionView() }
                .tabItem { Label("Nutrition", systemImage: "fork.knife") }
            NavigationStack { WorkoutsView() }
                .tabItem { Label("Workouts", systemImage: "figure.run") }
            NavigationStack { CoachView() }
                .tabItem { Label("Coach", systemImage: "sparkles") }
            NavigationStack { MoreView() }
                .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
        }
    }
}

#Preview {
    RootView().environmentObject(AppStore())
}
