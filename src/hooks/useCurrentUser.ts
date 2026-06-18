import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

export type Role = 'owner' | 'admin' | 'vendedor' | 'default'

export interface CurrentUserState {
  user: User | null
  role: Role
  isAdmin: boolean  // owner or admin — can make direct changes
  loading: boolean
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  vendedor: 'Vendedor',
  default: 'Invitado',
}

export const getRoleLabel = (role: Role) => ROLE_LABELS[role]

export function useCurrentUser(): CurrentUserState {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>('default')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      if (!firebaseUser) {
        setUser(null)
        setRole('default')
        setLoading(false)
        return
      }
      setUser(firebaseUser)
      try {
        const userRef = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(userRef)
        if (snap.exists()) {
          setRole((snap.data().role as Role) ?? 'default')
        } else {
          await setDoc(userRef, {
            email: firebaseUser.email,
            role: 'default',
            createdAt: serverTimestamp(),
          })
          setRole('default')
        }
      } catch (err) {
        console.error('[useCurrentUser] Firestore error:', err)
        setRole('default')
      }
      setLoading(false)
    })
    return unsub
  }, [])

  return {
    user,
    role,
    isAdmin: role === 'owner' || role === 'admin',
    loading,
  }
}
