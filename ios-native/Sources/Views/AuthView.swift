import SwiftUI

struct AuthView: View {
    @EnvironmentObject var store: AppStore
    @State private var email = ""
    @State private var password = ""
    @State private var creating = false
    @FocusState private var focus: Field?
    enum Field { case email, password }

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: "sparkles")
                    .font(.system(size: 38, weight: .bold))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 84, height: 84)
                    .liquidGlass(cornerRadius: 26)

                Text(creating ? "Create your AskAI account" : "Welcome back")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                Text("Sign in to sync your chats across web, Android & iOS.")
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).padding(.horizontal, 30)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .liquidGlass(cornerRadius: 18)

                    SecureField("Password", text: $password)
                        .textContentType(creating ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .liquidGlass(cornerRadius: 18)
                }
                .padding(.horizontal, 24)

                if let err = store.errorText {
                    Text(err).font(.caption).foregroundStyle(.red).padding(.horizontal, 24)
                }

                Button {
                    focus = nil
                    Task { await store.signIn(email: email, password: password, creating: creating) }
                } label: {
                    HStack {
                        if store.authBusy { ProgressView().tint(.white) }
                        Text(creating ? "Create account" : "Sign in").fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(
                        LinearGradient(colors: [Color.accentColor, Color(hex: 0xBE8CFF)],
                                       startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .disabled(email.isEmpty || password.count < 6 || store.authBusy)
                .opacity((email.isEmpty || password.count < 6) ? 0.6 : 1)
                .padding(.horizontal, 24)

                Button(creating ? "I already have an account" : "Create a new account") {
                    creating.toggle(); store.errorText = nil
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.accentColor)

                Spacer()
                Button("Continue without an account") { store.continueAsGuest() }
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    .padding(.bottom, 16)
            }
        }
    }
}
