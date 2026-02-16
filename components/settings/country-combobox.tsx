'use client'

import { useState } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxCollection,
} from '@/components/ui/combobox'
import { COUNTRIES } from '@/lib/constants/countries'

interface CountryComboboxProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function CountryCombobox({ value, onValueChange, disabled }: CountryComboboxProps) {
  const [searchValue, setSearchValue] = useState('')
  
  // Find the selected country
  const selectedCountry = COUNTRIES.find((c) => c.code === value)
  
  // Filter countries based on search
  const filteredCountries = COUNTRIES.filter((country) =>
    country.name.toLowerCase().includes(searchValue.toLowerCase())
  )
  
  return (
    <Combobox
      open={undefined}
      onOpenChange={undefined}
      value={value}
      onValueChange={(newValue) => {
        if (newValue) {
          onValueChange(newValue)
        }
      }}
      disabled={disabled}
    >
      <ComboboxInput
        placeholder={selectedCountry ? selectedCountry.name : 'Select a country...'}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        showTrigger
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxList>
          {filteredCountries.length === 0 ? (
            <ComboboxEmpty>No country found</ComboboxEmpty>
          ) : (
            filteredCountries.map((country) => (
              <ComboboxItem key={country.code} value={country.code}>
                {country.name}
              </ComboboxItem>
            ))
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
