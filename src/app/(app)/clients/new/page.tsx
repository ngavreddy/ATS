import ClientForm from '../ClientForm'
import { createClientRecord } from '../actions'

export default function NewClient() {
  return <ClientForm action={createClientRecord} />
}
