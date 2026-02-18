'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Tables } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CountryCombobox } from '@/components/settings/country-combobox'
import { updateCompany, closeWorkspace } from '@/app/(app)/settings/actions'
import { type CompanyAccessMode } from '@/lib/subscriptions/helpers'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, AlertCircle } from 'lucide-react'

type Company = Tables<'companies'>
type CompanyFormData = {
  name: string
  company_registration_id: string
  tax_id: string
  address_line1: string
  address_line2: string
  city: string
  postal_code: string
  country: string
  bank_account_name: string
  bank_account_number: string
  bank_bic: string
}
type CompanyField = keyof CompanyFormData

const REQUIRED_FIELDS: CompanyField[] = [
  'name',
]

interface CompanyFormProps {
  company: Company
  userRole: string
  companyAccessMode: CompanyAccessMode
  onWorkspaceClosed?: () => void
  onSaveStateChange?: (state: { isDirty: boolean; isSaving: boolean }) => void
  onSaveRequestRegister?: (save: (() => void) | null) => void
}

export function CompanyForm({
  company,
  userRole,
  companyAccessMode,
  onWorkspaceClosed,
  onSaveStateChange,
  onSaveRequestRegister,
}: CompanyFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<CompanyFormData>({
    name: company.name || '',
    company_registration_id: company.company_registration_id || '',
    tax_id: company.tax_id || '',
    address_line1: company.address_line1 || '',
    address_line2: company.address_line2 || '',
    city: company.city || '',
    postal_code: company.postal_code || '',
    country: company.country || '',
    bank_account_name: company.bank_account_name || '',
    bank_account_number: company.bank_account_number || '',
    bank_bic: company.bank_bic || '',
  })
  
  const [isDirty, setIsDirty] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CompanyField, string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeConfirmation, setCloseConfirmation] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const [effectiveAccessMode, setEffectiveAccessMode] = useState<CompanyAccessMode>(companyAccessMode)
  
  const initialDataRef = useRef(formData)
  const isOwner = userRole === 'owner'
  const isReadOnly = effectiveAccessMode === 'read_only'
  const canEdit = isOwner && !isReadOnly
  
  // Check if form is dirty
  useEffect(() => {
    const hasChanges = Object.keys(formData).some(
      (key) => formData[key as keyof typeof formData] !== initialDataRef.current[key as keyof typeof formData]
    )
    setIsDirty(hasChanges)
  }, [formData])

  useEffect(() => {
    setEffectiveAccessMode(companyAccessMode)
  }, [companyAccessMode])

  useEffect(() => {
    onSaveStateChange?.({ isDirty: canEdit ? isDirty : false, isSaving })
  }, [canEdit, isDirty, isSaving, onSaveStateChange])
  
  // Handle field change
  const handleFieldChange = (field: CompanyField, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (REQUIRED_FIELDS.includes(field) && value.trim().length > 0) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const validateRequiredFields = (data: CompanyFormData) => {
    const nextErrors: Partial<Record<CompanyField, string>> = {}

    REQUIRED_FIELDS.forEach((field) => {
      if (data[field].trim().length === 0) {
        nextErrors[field] = 'This field is required'
      }
    })

    return nextErrors
  }
  
  // Save all changes
  const handleSaveAll = useCallback(async () => {
    if (!canEdit || !isDirty || isSaving) return

    const nextErrors = validateRequiredFields(formData)
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    
    setIsSaving(true)
    
    const formDataToSend = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      formDataToSend.append(key, value)
    })
    
    const result = await updateCompany(formDataToSend)
    
    setIsSaving(false)
    
    if (result.success) {
      initialDataRef.current = { ...formData }
      setIsDirty(false)
      setFieldErrors({})
      
      toast.success('Changes saved')
    } else {
      if (result.error === 'WORKSPACE_READ_ONLY') {
        toast.error('Workspace is read-only.')
        return
      }
      toast.error(result.error || 'Failed to save changes')
    }
  }, [canEdit, formData, isDirty, isSaving])

  useEffect(() => {
    onSaveRequestRegister?.(() => {
      void handleSaveAll()
    })
    return () => onSaveRequestRegister?.(null)
  }, [handleSaveAll, onSaveRequestRegister])
  
  const handleCloseWorkspace = async () => {
    if (!isOwner || isReadOnly) return

    setIsClosing(true)

    const formDataToSend = new FormData()
    formDataToSend.append('confirmation', closeConfirmation)

    const result = await closeWorkspace(formDataToSend)

    setIsClosing(false)

    if (!result.success) {
      if (result.error === 'WORKSPACE_READ_ONLY') {
        toast.error('Workspace is read-only.')
        return
      }
      toast.error(result.error || 'Failed to close workspace')
      return
    }

    setCloseDialogOpen(false)
    setCloseConfirmation('')
    setEffectiveAccessMode('read_only')
    onWorkspaceClosed?.()
    toast.success('Workspace closed. It is now read-only.')
    router.refresh()
  }
  
  return (
    <div className="space-y-6">
      {!isOwner && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only owners can edit company settings
          </AlertDescription>
        </Alert>
      )}

      {isReadOnly && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Workspace is read-only. Data is preserved.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Company information</CardTitle>
          <CardDescription>
            Basic details about your company
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              disabled={!canEdit}
              required
            />
            {fieldErrors.name && (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="company_registration_id">Company registration ID</Label>
            <Input
              id="company_registration_id"
              value={formData.company_registration_id}
              onChange={(e) => handleFieldChange('company_registration_id', e.target.value)}
              disabled={!canEdit}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tax_id">Tax ID</Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => handleFieldChange('tax_id', e.target.value)}
              aria-invalid={Boolean(fieldErrors.tax_id)}
              disabled={!canEdit}
            />
            {fieldErrors.tax_id && (
              <p className="text-sm text-destructive">{fieldErrors.tax_id}</p>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Invoice address</CardTitle>
          <CardDescription>
            Address used for invoicing and billing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address_line1">Address line 1</Label>
            <Input
              id="address_line1"
              value={formData.address_line1}
              onChange={(e) => handleFieldChange('address_line1', e.target.value)}
              aria-invalid={Boolean(fieldErrors.address_line1)}
              disabled={!canEdit}
            />
            {fieldErrors.address_line1 && (
              <p className="text-sm text-destructive">{fieldErrors.address_line1}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address_line2">Address line 2</Label>
            <Input
              id="address_line2"
              value={formData.address_line2}
              onChange={(e) => handleFieldChange('address_line2', e.target.value)}
              disabled={!canEdit}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                aria-invalid={Boolean(fieldErrors.city)}
                disabled={!canEdit}
              />
              {fieldErrors.city && (
                <p className="text-sm text-destructive">{fieldErrors.city}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal code</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => handleFieldChange('postal_code', e.target.value)}
                aria-invalid={Boolean(fieldErrors.postal_code)}
                disabled={!canEdit}
              />
              {fieldErrors.postal_code && (
                <p className="text-sm text-destructive">{fieldErrors.postal_code}</p>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <CountryCombobox
              value={formData.country}
              onValueChange={(value) => handleFieldChange('country', value)}
              disabled={!canEdit}
            />
            {fieldErrors.country && (
              <p className="text-sm text-destructive">{fieldErrors.country}</p>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Bank information</CardTitle>
          <CardDescription>
            Bank account details for payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bank_account_name">Account name</Label>
            <Input
              id="bank_account_name"
              value={formData.bank_account_name}
              onChange={(e) => handleFieldChange('bank_account_name', e.target.value)}
              aria-invalid={Boolean(fieldErrors.bank_account_name)}
              disabled={!canEdit}
            />
            {fieldErrors.bank_account_name && (
              <p className="text-sm text-destructive">{fieldErrors.bank_account_name}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bank_account_number">Account number</Label>
            <Input
              id="bank_account_number"
              value={formData.bank_account_number}
              onChange={(e) => handleFieldChange('bank_account_number', e.target.value)}
              aria-invalid={Boolean(fieldErrors.bank_account_number)}
              disabled={!canEdit}
            />
            {fieldErrors.bank_account_number && (
              <p className="text-sm text-destructive">{fieldErrors.bank_account_number}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bank_bic">BIC / SWIFT code</Label>
            <Input
              id="bank_bic"
              value={formData.bank_bic}
              onChange={(e) => handleFieldChange('bank_bic', e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>
      
      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              This will close the workspace and make it read-only. Data is preserved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={isReadOnly}>
                  {isReadOnly ? 'Workspace closed' : 'Close workspace'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Close workspace?</DialogTitle>
                  <DialogDescription>
                    Closing this workspace makes it read-only. Your data is preserved and sign-in access remains available.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="close-confirm">
                    Type <span className="font-semibold">CLOSE</span> to confirm
                  </Label>
                  <Input
                    id="close-confirm"
                    value={closeConfirmation}
                    onChange={(e) => setCloseConfirmation(e.target.value)}
                    placeholder="CLOSE"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCloseDialogOpen(false)
                      setCloseConfirmation('')
                    }}
                    disabled={isClosing}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleCloseWorkspace}
                    disabled={closeConfirmation !== 'CLOSE' || isClosing}
                  >
                    {isClosing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Closing...
                      </>
                    ) : (
                      'Close workspace'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
