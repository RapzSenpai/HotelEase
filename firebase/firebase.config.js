
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


const firebaseConfig = {
  apiKey: "AIzaSyDqlcREgKDlwSQfJZsFkJP2vl9AkPc8dbc",
  authDomain: "hotelease-9e3a0.firebaseapp.com",
  projectId: "hotelease-9e3a0",
  storageBucket: "hotelease-9e3a0.firebasestorage.app",
  messagingSenderId: "24453972621",
  appId: "1:24453972621:web:bf214741930f69b7df98c4"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;