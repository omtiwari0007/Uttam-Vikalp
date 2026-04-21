// js/auth.js
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase-config.js";

const elements = {
    loginTrigger: document.getElementById('login-trigger'),
    userName: document.getElementById('user-name'),
    userAvatar: document.querySelector('.avatar')
};

// 1. Login Function
export async function loginUser() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        console.log("Login Success:", user.displayName);
    } catch (error) {
        console.error("Login Failed:", error);
        alert("Login Error: " + error.message);
    }
}

// 2. Logout Function
export async function logoutUser() {
    try {
        await signOut(auth);
        console.log("User Logged Out");
        window.location.reload();
    } catch (error) {
        console.error("Logout Error:", error);
    }
}

// 3. Listener (Check if user is already logged in)
export function initAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User Logged In Hai
            elements.userName.textContent = user.displayName.split(' ')[0]; // Sirf First Name
            
            // Agar photo hai toh dikhao
            if(user.photoURL) {
                elements.userAvatar.innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            }
            
            // Icon badal do
            elements.loginTrigger.querySelector('button span').textContent = "logout";
            console.log("User Active:", user.uid);
        } else {
            // User Guest Hai
            elements.userName.textContent = "Login with Google";
            elements.userAvatar.textContent = "G";
            elements.loginTrigger.querySelector('button span').textContent = "login";
        }
    });
}
