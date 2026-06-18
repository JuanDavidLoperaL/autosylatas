import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDN3zQ-NZ5AWN7QSdZKOGzSQWDtq_h772w",
  authDomain: "autos-y-latas-c867c.firebaseapp.com",
  projectId: "autos-y-latas-c867c",
  storageBucket: "autos-y-latas-c867c.firebasestorage.app",
  messagingSenderId: "336371534984",
  appId: "1:336371534984:web:788581063eaffd0fb2233d",
  measurementId: "G-QH6JPQ0SVY"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
