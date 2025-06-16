// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may not obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { GoogleGenAI } from "@google/genai";
import { dataSets, RawDataSets, QuadrimestreData, YearlyGoalData } from './panel-data'; // Import from panel-data.ts

// Initialize the GoogleGenAI client with the API key from environment variables
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- TYPE DEFINITIONS ---
// Specific Goal type for application logic after processing RawDataSets
interface Goal {
    id: number;
    title: string;
    polaridade: string;
    diretriz: string;
    objetivo: string;
    yearly_data: { [year: string]: YearlyGoalData };
}


document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const goalsGrid = document.getElementById('goals-grid') as HTMLElement;
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const yearFilter = document.getElementById('year-filter') as HTMLSelectElement;
    const diretrizFilter = document.getElementById('diretriz-filter') as HTMLSelectElement;
    const objetivoFilter = document.getElementById('objetivo-filter') as HTMLSelectElement;
    const quadrimestreFilter = document.getElementById('quadrimestre-filter') as HTMLSelectElement;
    const statusFilter = document.getElementById('status-filter') as HTMLSelectElement;
    const noResults = document.getElementById('no-results') as HTMLElement;
    const goalsListTitle = document.getElementById('goals-list-title') as HTMLElement;
    const chartsGrid = document.getElementById('charts-grid') as HTMLElement;
    const modal = document.getElementById('goal-modal') as HTMLElement;
    const modalWrapper = document.getElementById('modal-content-wrapper') as HTMLElement;

    // --- State ---
    let yearCharts: {[year: string]: any} = {}; // Consider a more specific type for Chart instances if possible
    let activeData: Goal[] = []; 
    let currentFilteredData: Goal[] = []; 
    
    // This function reorganizes the original dataset into a more usable structure.
    function initializeData() {
        let allGoals: Goal[] = [];
        let allDiretrizes = new Set<string>();
        let allObjetivos = new Set<string>();

        const masterData: { [id: number]: Goal } = {};

        // First, populate the master structure from all years to gather all goals
        for (const year in dataSets) {
            for (const diretriz in dataSets[year]) {
                allDiretrizes.add(diretriz);
                for (const objetivo in dataSets[year][diretriz]) {
                    allObjetivos.add(objetivo);
                    for (const goalData of dataSets[year][diretriz][objetivo]) {
                        if (!masterData[goalData.id]) {
                            masterData[goalData.id] = {
                                id: goalData.id,
                                title: goalData.title,
                                polaridade: goalData.polaridade,
                                diretriz: diretriz,
                                objetivo: objetivo,
                                yearly_data: {} 
                            };
                        }
                    }
                }
            }
        }
         // Now, populate the yearly data into the master structure
        for (const year in dataSets) {
            for (const diretriz in dataSets[year]) {
                for (const objetivo in dataSets[year][diretriz]) {
                    for (const goalData of dataSets[year][diretriz][objetivo]) {
                        if (masterData[goalData.id]) {
                            masterData[goalData.id].yearly_data[year] = {
                                esperado: goalData.esperado,
                                resultado: goalData.resultado,
                                quadrimestres: goalData.quadrimestres || {} 
                            };
                        }
                    }
                }
            }
        }
        
        allGoals = Object.values(masterData);

         // Add placeholder data for 2025
        allGoals.forEach(goal => {
            if (!goal.yearly_data["2025"]) {
                 const finalYearData = goal.yearly_data["2024"]; 
                 goal.yearly_data["2025"] = {
                     esperado: finalYearData?.esperado || "N/A", 
                     resultado: "S/N",
                     quadrimestres: { "1": "S/N", "2": "S/N", "3": "S/N" }
                 };
            }
        });

        activeData = allGoals;
        
        diretrizFilter.innerHTML = '<option value="todas">Todas</option>';
        [...allDiretrizes].sort().forEach(d => {
            const option = document.createElement('option');
            option.value = d;
            option.textContent = d;
            option.title = d; 
            diretrizFilter.appendChild(option);
        });
        
        updateObjetivoFilter();
    }

    function updateObjetivoFilter() {
        const selectedDiretriz = diretrizFilter.value;
        const objetivosOfDiretriz = new Set<string>();

        activeData.forEach(goal => {
            if (selectedDiretriz === 'todas' || goal.diretriz === selectedDiretriz) {
                objetivosOfDiretriz.add(goal.objetivo);
            }
        });
        
        objetivoFilter.innerHTML = '<option value="todos">Todos</option>';
        [...objetivosOfDiretriz].sort().forEach(o => {
            const option = document.createElement('option');
            option.value = o;
            option.textContent = o;
            option.title = o; 
            objetivoFilter.appendChild(option);
        });
    }

    function parseValue(value: string | number | undefined | null): number {
        if (value === undefined || value === null) return NaN;
        const strValue = String(value);
        if (strValue.toLowerCase() === 'na' || strValue.trim() === '' || strValue.toLowerCase().includes('andamento') || strValue.toLowerCase().includes('apurando') || strValue.toLowerCase().includes('mensurado') || strValue.toLowerCase() === 's/n') return NaN;
        const cleanedValue = strValue.replace('%', '').replace(',', '.').replace("'", "").trim();
        const numericValue = parseFloat(cleanedValue);
        return numericValue; // parseFloat itself returns NaN if parsing fails
    }


    function getStatus(goal: Goal, result: string | number | undefined, expected: string | number | undefined) {
        const resultadoVal = String(result).toLowerCase(); 
        if (result === undefined || result === null || resultadoVal.includes('andamento') || resultadoVal.includes('apurando') || resultadoVal === 's/n' || resultadoVal === 'na' || resultadoVal.includes('mensurado')) {
             return { text: "Em Andamento", color: "yellow"};
        }
        const esperadoNum = parseValue(expected);
        const resultadoNum = parseValue(result);

        if (isNaN(esperadoNum) || isNaN(resultadoNum)) {
             return { text: "Não Aplicável", color: "gray"};
        }
        
        const polaridade = goal.polaridade.toUpperCase();

        if (polaridade === 'MENOR') {
            if (resultadoNum < esperadoNum) return { text: "Superada", color: "green" };
            if (resultadoNum === esperadoNum) return { text: "Alcançada", color: "green"}; // Changed to green
            return { text: "Não Alcançada", color: "red" };
        } else { // Default to MAIOR
             if (resultadoNum > esperadoNum) return { text: "Superada", color: "green"};
             if (resultadoNum >= esperadoNum) return { text: "Alcançada", color: "green"}; // Changed to green
             if (resultadoNum >= esperadoNum * 0.9) return { text: "Parcialmente Alcançada", color: "orange"};
             return { text: "Não Alcançada", color: "red"};
        }
    }
    
    function getSimplifiedStatus(detailedStatusText: string) {
        switch(detailedStatusText) {
            case 'Superada':
            case 'Alcançada':
                return 'Alcançada';
            case 'Parcialmente Alcançada':
            case 'Não Alcançada':
                return 'Não Alcançada';
            default:
                return 'Outro'; 
        }
    }

    function showLoading(container: HTMLElement, message: string) { container.innerHTML = `<div class="flex items-center justify-center p-8"><svg class="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-lg text-gray-600">${message}</span></div>`; }
    function showError(container: HTMLElement, error: Error) { console.error("Error AI:", error); container.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded"><strong>Erro:</strong><p>${error.message || 'Falha ao contatar a API.'}</p></div>`; }
    
    function renderAllYearCharts(baseFilteredData: Goal[]) {
        const years = ["2022", "2023", "2024"];
        chartsGrid.innerHTML = ''; 
        const selectedQuad = quadrimestreFilter.value;
        const selectedStatusFilter = statusFilter.value;

        years.forEach(year => {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'w-full h-80 flex flex-col items-center';
            chartContainer.innerHTML = `
                <h4 class="text-lg font-semibold text-gray-700 mb-2" id="chart-label-${year}">Resumo ${year}</h4>
                <div class="relative w-full h-full">
                    <canvas id="summaryChart${year}" role="img" aria-labelledby="chart-label-${year}"></canvas>
                </div>
            `;
            chartsGrid.appendChild(chartContainer);

            let filteredForChart = baseFilteredData;
             if (selectedStatusFilter !== 'todos') {
                filteredForChart = baseFilteredData.filter(goal => {
                    const yearData = goal.yearly_data[year];
                    if (!yearData) return false;
                    
                    let resultForStatusCheck: string | number | undefined = selectedQuad === 'anual' ? yearData.resultado : (yearData.quadrimestres ? yearData.quadrimestres[selectedQuad as keyof QuadrimestreData] : yearData.resultado);
                    if (resultForStatusCheck === undefined && selectedQuad !== 'anual') resultForStatusCheck = yearData.resultado;

                    const simplifiedStatus = getSimplifiedStatus(getStatus(goal, resultForStatusCheck, yearData.esperado).text);
                    return simplifiedStatus === selectedStatusFilter;
                });
            }
            
            const statusCounts = { 'Alcançada': 0, 'Não Alcançada': 0, 'Outro': 0 };
            filteredForChart.forEach(goal => {
                const yearData = goal.yearly_data[year];
                if (!yearData) return;

                let result: string | number | undefined = selectedQuad === 'anual' ? yearData.resultado : (yearData.quadrimestres ? yearData.quadrimestres[selectedQuad as keyof QuadrimestreData] : yearData.resultado);
                if (result === undefined && selectedQuad !== 'anual') result = yearData.resultado; 

                let expected = yearData.esperado;
                const simplifiedStatus = getSimplifiedStatus(getStatus(goal, result, expected).text);
                if (statusCounts[simplifiedStatus as keyof typeof statusCounts] !== undefined) {
                    statusCounts[simplifiedStatus as keyof typeof statusCounts]++;
                }
            });
            
            const chartData = {
                labels: ['Alcançada', 'Não Alcançada', 'Outros (Em Andamento/N/A)'],
                datasets: [{
                    label: `Metas ${year}`,
                    data: [statusCounts['Alcançada'], statusCounts['Não Alcançada'], statusCounts['Outro']],
                    backgroundColor: ['#22C55E', '#EF4444', '#FBBF24'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            };

            const canvasElement = document.getElementById(`summaryChart${year}`) as HTMLCanvasElement | null;
            if (!canvasElement) return;
            const ctx = canvasElement.getContext('2d');
            if (!ctx) return;

            if (yearCharts[year]) { yearCharts[year].destroy(); }

            yearCharts[year] = new Chart(ctx, {
                type: 'doughnut',
                data: chartData,
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context: any) {
                                    let label = context.label || '';
                                    if (label) { label += ': '; }
                                    const total = context.chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
                                    const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) + '%' : '0%';
                                    label += `${context.raw} (${percentage})`;
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        });
    }
    
    function renderGoals(filteredData: Goal[], selectedYear: string) {
        goalsGrid.innerHTML = '';
        const selectedQuad = quadrimestreFilter.value;
        goalsListTitle.textContent = `Detalhamento das Metas - ${selectedYear}${selectedQuad !== 'anual' ? ` (${selectedQuad}º RDQA)` : ' (Anual)'}`;

        if (filteredData.length === 0) {
            noResults.classList.remove('hidden');
            return;
        }
        noResults.classList.add('hidden');

        filteredData.forEach(goal => {
            const yearData = goal.yearly_data[selectedYear];
            if (!yearData) return;

            let displayResult: string | number | undefined = selectedQuad === 'anual' ? yearData.resultado : (yearData.quadrimestres ? yearData.quadrimestres[selectedQuad as keyof QuadrimestreData] : yearData.resultado);
            if (displayResult === undefined && selectedQuad !== 'anual') displayResult = yearData.resultado; 

            const statusInfo = getStatus(goal, displayResult, yearData.esperado);

            let historyHtml = ['2022', '2023', '2024', '2025'].map(year => {
                const data = goal.yearly_data[year];
                if (!data) return `<div class="bg-gray-100 col-span-2"><strong class="font-semibold">${year}:</strong> N/A</div>`;
                
                let histResult: string | number | undefined = selectedQuad === 'anual' || year !== selectedYear ? data.resultado : (data.quadrimestres ? data.quadrimestres[selectedQuad as keyof QuadrimestreData] : data.resultado);
                if (histResult === undefined && selectedQuad !== 'anual' && year === selectedYear) histResult = data.resultado;

                const historyStatus = getStatus(goal, histResult, data.esperado);
                return `<div class="bg-gray-100"><strong class="font-semibold">${year}:</strong></div><div class="bg-gray-100 text-right"><span class="text-${historyStatus.color}-600 font-semibold">${histResult || 'N/A'}</span> / ${data.esperado || 'N/A'}</div>`;
            }).join('');

            const card = document.createElement('div');
            card.className = `goal-card bg-white p-4 rounded-lg shadow-sm border-l-4 border-${statusInfo.color}-500 cursor-pointer flex flex-col`;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0'); 
            card.setAttribute('aria-label', `Detalhes da Meta ${goal.id}: ${goal.title}`);

            card.innerHTML = `
                <div class="flex-grow flex flex-col">
                    <div class="flex justify-between items-start mb-2">
                         <h3 class="text-base font-semibold text-gray-800">Meta ${goal.id}</h3>
                        <span class="text-xs font-bold uppercase px-2 py-1 bg-${statusInfo.color}-100 text-${statusInfo.color}-800 rounded-full whitespace-nowrap">${statusInfo.text}</span>
                    </div>
                    <p class="text-gray-600 text-sm my-2 flex-grow">${goal.title}</p>
                    <div class="mt-3 pt-3 border-t">
                        <h4 class="text-xs font-bold text-gray-500 mb-2 uppercase">Histórico de Resultados (${selectedQuad === 'anual' ? 'Anual' : selectedQuad + 'º RDQA'}) (Resultado / Esperado)</h4>
                        <div class="year-result-grid">
                            ${historyHtml}
                        </div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => openGoalModal(goal));
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openGoalModal(goal); });
            goalsGrid.appendChild(card);
        });
    }
    
    function filterAndRender() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedDiretriz = diretrizFilter.value;
        const selectedObjetivo = objetivoFilter.value;
        
        const baseFilteredData = activeData.filter(goal => {
            const searchMatch = goal.title.toLowerCase().includes(searchTerm) || String(goal.id).includes(searchTerm) || `meta ${goal.id}`.includes(searchTerm);
            const diretrizMatch = selectedDiretriz === 'todas' || goal.diretriz === selectedDiretriz;
            const objetivoMatch = selectedObjetivo === 'todos' || goal.objetivo === selectedObjetivo;
            return searchMatch && diretrizMatch && objetivoMatch;
        });

        currentFilteredData = baseFilteredData; 
        renderAllYearCharts(baseFilteredData); 
        
        const selectedYearToList = yearFilter.value;
        renderGoals(baseFilteredData, selectedYearToList);
    }

    async function callGeminiAPI(promptText: string) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-04-17',
                contents: promptText 
            });
            const text = response.text;

            if (typeof text === 'string') {
                return text;
            } else {
                console.error("Invalid API response: text is not a string or is missing.", response);
                throw new Error('Resposta da API inválida ou texto não encontrado.');
            }
        } catch (error) {
            console.error("Gemini API call failed:", error);
            let errorMessage = 'Falha ao contatar a API Gemini.';
            if (error instanceof Error && error.message) {
                errorMessage += ` Detalhes: ${error.message}`;
            }
            console.error("Original Gemini API error details:", error);
            throw new Error(errorMessage);
        }
    }
    
    async function generateQualitativeAnalysis(goal: Goal, resultForModal: string | number | undefined, statusForModal: {text: string, color: string}, periodText: string, year: string) {
        const contentContainer = document.getElementById('qualitative-analysis-content') as HTMLElement;
        const genButton = document.getElementById('generate-analysis-btn') as HTMLButtonElement;
        genButton.disabled = true;
        showLoading(contentContainer, "Gerando análise qualitativa...");
        (document.getElementById('action-plan-container') as HTMLElement).classList.add('hidden'); 
        const yearData = goal.yearly_data[year];

        const prompt = `
            Você é um especialista em gestão de saúde pública (SUS) e análise de indicadores do Relatório Anual de Gestão (RAG).
            Gere uma análise qualitativa concisa e objetiva para a seguinte meta:

            **Meta ID:** ${goal.id}
            **Título da Meta:** ${goal.title}
            **Ano de Referência:** ${year}
            **Período de Análise:** ${periodText}
            **Diretriz Estratégica:** ${goal.diretriz}
            **Objetivo Estratégico:** ${goal.objetivo}
            **Resultado Esperado:** ${yearData.esperado}
            **Resultado Alcançado:** ${resultForModal}
            **Status Atual:** ${statusForModal.text}
            **Polaridade da Meta:** ${goal.polaridade === 'maior' ? 'Quanto maior, melhor' : 'Quanto menor, melhor'}

            **Instruções para a Análise (formato Markdown):**

            1.  **Análise Comparativa do Resultado:**
                *   Compare brevemente o resultado alcançado com o esperado para o período.
                *   Destaque se o resultado superou, atingiu, atingiu parcialmente ou não atingiu a meta, e a relevância dessa diferença.

            2.  **Hipóteses e Fatores Contribuintes (2-3 pontos principais):**
                *   Levante hipóteses concisas sobre os possíveis fatores que influenciaram o resultado (positivo ou negativo).
                *   Seja específico(a) se possível, considerando o contexto da saúde pública.

            3.  **Sugestões Estratégicas (2-3 ações concretas):**
                *   Proponha ações claras, realistas e direcionadas para manter/melhorar o resultado ou para reverter um cenário negativo.
                *   As ações devem ser focadas e de alto impacto.

            Mantenha a linguagem profissional, clara e direta. Evite generalidades excessivas.
            O resultado deve ser apenas o texto em Markdown.
        `;
        try {
            const text = await callGeminiAPI(prompt);
            const converter = new showdown.Converter({tables: true, openLinksInNewWindow: true, simplifiedAutoLink: true, strikethrough: true});
            contentContainer.innerHTML = converter.makeHtml(text);
            const actionPlanBtn = document.getElementById('generate-action-plan-btn') as HTMLButtonElement;
            actionPlanBtn.classList.remove('hidden');
            actionPlanBtn.dataset.analysisText = text; 
            actionPlanBtn.disabled = false; 
        } catch (error) { showError(contentContainer, error as Error); } finally { genButton.disabled = false; }
    }
    
    async function generateActionPlan(goal: Goal, analysisText: string) {
        const contentContainer = document.getElementById('action-plan-content') as HTMLElement;
        const genButton = document.getElementById('generate-action-plan-btn') as HTMLButtonElement;
        genButton.disabled = true;
        (document.getElementById('action-plan-container') as HTMLElement).classList.remove('hidden');
        showLoading(contentContainer, "Elaborando plano de ação...");

        const prompt = `
            Com base na meta e na análise qualitativa fornecida, crie um plano de ação detalhado.
            Apresente o plano em uma tabela Markdown com as seguintes colunas: "Ação Proposta", "Responsável Sugerido (Setor/Área)", "Prazo Sugerido (Ex: Curto, Médio, Longo Prazo ou data específica)", "Recursos Necessários (Principais)", "Indicador de Sucesso/Meta da Ação", "Status da Ação (Inicialmente 'A Fazer')".

            **Meta ID:** ${goal.id}
            **Título da Meta:** ${goal.title}

            **Análise Qualitativa Fornecida:**
            ---
            ${analysisText}
            ---

            **Instruções para o Plano de Ação:**
            *   As ações devem ser concretas, mensuráveis (se possível), alcançáveis, relevantes e com prazos definidos.
            *   Derive as ações das "Sugestões Estratégicas" e "Hipóteses/Problemáticas" da análise.
            *   Para "Indicador de Sucesso/Meta da Ação", defina um critério claro para medir o êxito da ação (ex: "Implementação de X%", "Redução de Y em Z dias", "Capacitação de N profissionais").
            *   Para "Status da Ação", defina inicialmente como "A Fazer" para todas as ações propostas.
            *   Seja específico quanto aos responsáveis e recursos, mesmo que genéricos (ex: "Equipe da Atenção Básica", "Recursos Humanos e Materiais de Escritório").
            *   Formate a resposta exclusivamente como uma tabela Markdown. Não inclua texto introdutório ou conclusivo fora da tabela.
        `;
        try {
            const text = await callGeminiAPI(prompt);
            const converter = new showdown.Converter({tables: true, openLinksInNewWindow: true, simplifiedAutoLink: true, strikethrough: true});
            contentContainer.innerHTML = converter.makeHtml(text);
        } catch (error) { showError(contentContainer, error as Error); } finally { genButton.disabled = false; }
    }

    async function exportModalContentToPDF(goal: Goal, selectedYear: string, periodText: string) {
        // @ts-ignore
        const { jsPDF } = window.jspdf;
        const modalContentForExport = document.getElementById('ai-export-content');
        const modalTitleText = `Análise da Meta ${goal.id}: ${goal.title}`;
        const modalSubtitleText = `RAG ${selectedYear} - ${periodText}`;
    
        if (!modalContentForExport) {
            alert("Conteúdo para exportação não encontrado.");
            return;
        }
    
        const actionPlanContainer = document.getElementById('action-plan-container') as HTMLElement;
        const actionPlanWasHidden = actionPlanContainer.classList.contains('hidden');
        if (actionPlanWasHidden && document.getElementById('action-plan-content')?.innerHTML.trim() !== '') {
            actionPlanContainer.classList.remove('hidden');
        }
    
        const exportButton = document.getElementById('export-pdf-btn') as HTMLButtonElement;
        const originalButtonText = exportButton.innerHTML;
        exportButton.disabled = true;
        exportButton.innerHTML = 'Gerando PDF... <svg class="animate-spin inline-block ml-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    
        try {
            // @ts-ignore
            const canvas = await html2canvas(modalContentForExport, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                 onclone: (documentClone) => {
                    const clonedContent = documentClone.getElementById('ai-export-content');
                    if (clonedContent) {
                         // Ensure all nested content is visible and styled for capture
                        const analysisContent = clonedContent.querySelector('#qualitative-analysis-content');
                        const planContent = clonedContent.querySelector('#action-plan-content');
                        if (analysisContent) (analysisContent as HTMLElement).style.display = 'block';
                        if (planContent) (planContent as HTMLElement).style.display = 'block';

                        // Ensure headers are styled correctly in the clone
                        clonedContent.querySelectorAll('h3').forEach(h => {
                            (h as HTMLElement).style.color = '#1f2937'; // Example: Ensure text color
                            (h as HTMLElement).style.fontSize = '1.25rem'; // Tailwind 'text-xl'
                            (h as HTMLElement).style.fontWeight = '700'; // Tailwind 'font-bold'
                        });
                        // You might need to inline more styles if html2canvas doesn't pick them up from external CSS fully
                    }
                }
            });
    
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });
    
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pdfWidth - 2 * margin;
    
            let currentY = margin;
            pdf.setFontSize(16);
            pdf.setTextColor(40, 40, 40);
            const titleLines = pdf.splitTextToSize(modalTitleText, contentWidth);
            pdf.text(titleLines, margin, currentY + 5);
            currentY += titleLines.length * 7 + 5; 
    
            pdf.setFontSize(12);
            pdf.setTextColor(100, 100, 100);
            const subtitleLines = pdf.splitTextToSize(modalSubtitleText, contentWidth);
            pdf.text(subtitleLines, margin, currentY);
            currentY += subtitleLines.length * 5 + 10;
    
            const imgProps = pdf.getImageProperties(imgData);
            const canvasOriginalWidth = imgProps.width;
            const canvasOriginalHeight = imgProps.height;
            
            const imageDisplayWidth = contentWidth;
            const imageDisplayHeight = (canvasOriginalHeight * imageDisplayWidth) / canvasOriginalWidth;
    
            let canvasCutPositionY = 0; // Y-coordinate on the original canvas image
            let canvasHeightRemaining = canvasOriginalHeight;
    
            while (canvasHeightRemaining > 0) {
                if (currentY > pdfHeight - margin - 10 && canvasHeightRemaining > 0) { // Need at least 10mm for image part
                    pdf.addPage();
                    currentY = margin;
                }
    
                // Determine the height of the segment of the canvas to draw on the current PDF page
                const availablePageHeightForImage = pdfHeight - margin - currentY;
                // Convert this available PDF page height back to the canvas's original pixel height for slicing
                let canvasSliceHeight = (availablePageHeightForImage / imageDisplayHeight) * canvasOriginalHeight;
                canvasSliceHeight = Math.min(canvasSliceHeight, canvasHeightRemaining); // Don't try to slice more than remaining
                
                if (canvasSliceHeight <= 0 && canvasHeightRemaining > 0) { // Not enough space, or bad calculation
                    if (currentY !== margin) pdf.addPage(); // Avoid adding page if already at top of new page
                    currentY = margin;
                    // Recalculate slice for a full new page
                    const fullPageImageHeight = pdfHeight - 2 * margin;
                    canvasSliceHeight = Math.min( (fullPageImageHeight / imageDisplayHeight) * canvasOriginalHeight, canvasHeightRemaining);
                }

                const displaySegmentHeight = (canvasSliceHeight * imageDisplayWidth) / canvasOriginalWidth;

                if (displaySegmentHeight > 0) {
                    pdf.addImage(
                        imgData, 'PNG',
                        margin, currentY,
                        imageDisplayWidth, displaySegmentHeight,
                        undefined, 'FAST', 0,
                        // Source image clipping parameters (all in original canvas pixels)
                        0, // sx (start x on original canvas)
                        canvasCutPositionY, // sy (start y on original canvas)
                        canvasOriginalWidth, // sWidth (width of slice from original canvas)
                        canvasSliceHeight  // sHeight (height of slice from original canvas)
                    );
                }
                currentY += displaySegmentHeight + 2; // Add a small gap after the image segment
                canvasCutPositionY += canvasSliceHeight;
                canvasHeightRemaining -= canvasSliceHeight;
            }
            pdf.save(`Analise_Meta_${goal.id}_${selectedYear}_${periodText.replace(/º RDQA/g, 'Q').replace(/\s+/g, '_')}.pdf`);
    
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Falha ao gerar o PDF. Verifique o console para mais detalhes.");
        } finally {
            if (actionPlanWasHidden) {
                actionPlanContainer.classList.add('hidden');
            }
            exportButton.disabled = false;
            exportButton.innerHTML = originalButtonText;
        }
    }
    
    function openGoalModal(goal: Goal) {
        const selectedYear = yearFilter.value;
        const period = quadrimestreFilter.value;
        const periodText = period === 'anual' ? 'Anual' : `${period}º RDQA`;
        const yearData = goal.yearly_data[selectedYear];

        if (!yearData) {
            console.warn(`No data found for goal ${goal.id} in year ${selectedYear}`);
            modalWrapper.innerHTML = `<div class="p-6 text-center text-red-500">Dados não disponíveis para esta meta no ano selecionado.</div> <button id="close-modal" class="absolute top-4 right-4 text-gray-500 text-3xl leading-none hover:text-gray-800">&times;</button>`;
            modal.classList.remove('hidden');
            (document.getElementById('close-modal') as HTMLButtonElement).addEventListener('click', () => modal.classList.add('hidden'));
            return;
        }

        let resultForModal: string | number | undefined = period === 'anual' ? yearData.resultado : (yearData.quadrimestres ? yearData.quadrimestres[period as keyof QuadrimestreData] : yearData.resultado);
        if (resultForModal === undefined && period !== 'anual') resultForModal = yearData.resultado; 
        
        let statusForModal = getStatus(goal, resultForModal, yearData.esperado);

        // Calculate Variação
        let variacaoDisplay = "N/A";
        const esperadoNum = parseValue(yearData.esperado);
        const resultadoNum = parseValue(resultForModal);

        const isEsperadoPerc = typeof yearData.esperado === 'string' && yearData.esperado.includes('%');
        // Ensure resultForModal is treated as string for .includes('%') check
        const stringResultForModal = String(resultForModal);
        const isResultadoPerc = typeof resultForModal === 'string' && stringResultForModal.includes('%');
        const isPercentageContext = isEsperadoPerc || isResultadoPerc;
        
        if (!isNaN(esperadoNum) && !isNaN(resultadoNum)) {
            const variacao = resultadoNum - esperadoNum;
            const isNegative = variacao < 0;
            const absVariacao = Math.abs(variacao);
    
            let formattedAbsVariacao;
            if (isPercentageContext) {
                formattedAbsVariacao = absVariacao.toFixed(1); 
            } else if (Number.isInteger(absVariacao)) {
                formattedAbsVariacao = absVariacao.toString();
            } else {
                formattedAbsVariacao = absVariacao.toFixed(2);
            }
            variacaoDisplay = `${isNegative ? '-' : ''}${formattedAbsVariacao}${isPercentageContext ? '%' : ''}`;
        }


        modalWrapper.innerHTML = `
            <div class="p-6 md:p-8">
                <div class="flex justify-between items-start mb-4 pb-4 border-b">
                    <div><h2 class="text-2xl font-bold text-gray-800" id="modal-title-text">Detalhes da Meta ${goal.id}</h2><p class="text-sm text-gray-500">RAG ${selectedYear} - ${periodText}</p></div>
                    <button id="close-modal" aria-label="Fechar modal" class="text-gray-500 text-3xl leading-none hover:text-gray-800">&times;</button>
                </div>
                <div class="space-y-4">
                    <p class="text-lg text-gray-700 font-medium">${goal.title}</p>
                    <div class="text-sm text-gray-600 flex items-center">
                        ${goal.polaridade === 'maior' ? '<span class="text-green-500 mr-2 text-xl">📈</span> Meta de crescimento' : '<span class="text-red-500 mr-2 text-xl">📉</span> Meta de redução'}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div class="bg-sky-50 p-4 rounded-lg shadow-sm">
                            <h5 class="text-sm font-semibold text-sky-700 mb-1">Diretriz</h5>
                            <p class="text-xs text-sky-600 break-words">${goal.diretriz}</p>
                        </div>
                        <div class="bg-emerald-50 p-4 rounded-lg shadow-sm">
                            <h5 class="text-sm font-semibold text-emerald-700 mb-1">Objetivo</h5>
                            <p class="text-xs text-emerald-600 break-words">${goal.objetivo}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mt-4">
                        <div class="bg-gray-50 p-4 rounded-lg shadow-sm flex flex-col justify-between">
                            <p class="text-3xl font-bold text-gray-700">${yearData.esperado || 'N/A'}</p>
                            <p class="text-xs text-gray-500 mt-1">Meta Esperada</p>
                        </div>
                        <div class="bg-sky-50 p-4 rounded-lg shadow-sm flex flex-col justify-between">
                            <p class="text-3xl font-bold text-${statusForModal.color}-600">${resultForModal || 'N/A'}</p>
                            <p class="text-xs text-sky-600 mt-1">Resultado Alcançado</p>
                        </div>
                        <div class="bg-purple-50 p-4 rounded-lg shadow-sm flex flex-col justify-between">
                            <p class="text-3xl font-bold text-purple-600">${variacaoDisplay}</p>
                            <p class="text-xs text-purple-600 mt-1">Variação</p>
                        </div>
                    </div>
                    
                    <div class="mt-8 pt-6 border-t">
                        <div id="ai-export-content">
                            <div id="qualitative-analysis-container" class="mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">Análise Qualitativa com IA ✨</h3>
                                <div id="qualitative-analysis-content" class="ai-content text-gray-700 leading-relaxed min-h-[5rem]" aria-live="polite"></div>
                            </div>
                            <div id="action-plan-container" class="hidden mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">Plano de Ação com IA ✨</h3>
                                <div id="action-plan-content" class="ai-content text-gray-700 leading-relaxed min-h-[5rem]" aria-live="polite"></div>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-4 mt-4">
                            <button id="generate-analysis-btn" class="w-full sm:w-auto flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">Gerar Análise</button>
                            <button id="generate-action-plan-btn" class="w-full sm:w-auto flex-1 hidden bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">Elaborar Plano de Ação</button>
                            <button id="export-pdf-btn" class="w-full sm:w-auto flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">Exportar para PDF</button>
                        </div>
                    </div>
                </div>
            </div>`;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'modal-title-text');

        const closeModalBtn = document.getElementById('close-modal') as HTMLButtonElement;
        closeModalBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.removeAttribute('aria-modal');
            modal.removeAttribute('aria-labelledby');
        });
        (document.getElementById('generate-analysis-btn') as HTMLButtonElement).addEventListener('click', () => generateQualitativeAnalysis(goal, resultForModal, statusForModal, periodText, selectedYear));
        (document.getElementById('generate-action-plan-btn') as HTMLButtonElement).addEventListener('click', (e) => {
            const analysisText = (e.target as HTMLButtonElement).dataset.analysisText;
            if (analysisText) {
                generateActionPlan(goal, analysisText);
            } else {
                showError(document.getElementById('action-plan-content') as HTMLElement, { name: "InputError", message: "Análise qualitativa não encontrada. Gere a análise primeiro." });
            }
        });
        (document.getElementById('export-pdf-btn') as HTMLButtonElement).addEventListener('click', () => exportModalContentToPDF(goal, selectedYear, periodText));
        
        const escapeListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                modal.classList.add('hidden');
                modal.removeAttribute('aria-modal');
                modal.removeAttribute('aria-labelledby');
                document.removeEventListener('keydown', escapeListener); 
            }
        };
        document.addEventListener('keydown', escapeListener);

        modal.addEventListener('click', (e) => { 
            if ((e.target as HTMLElement).id === 'goal-modal') {
                modal.classList.add('hidden');
                modal.removeAttribute('aria-modal');
                modal.removeAttribute('aria-labelledby');
                document.removeEventListener('keydown', escapeListener); 
            }
        });
        closeModalBtn.focus(); 
    }
    
    // --- Initial Load & Event Listeners ---
    const allFilters = [yearFilter, searchInput, objetivoFilter, quadrimestreFilter, statusFilter];
    allFilters.forEach(el => el.addEventListener('change', filterAndRender));
    
    diretrizFilter.addEventListener('change', () => {
        updateObjetivoFilter(); 
        filterAndRender(); 
    });

    searchInput.addEventListener('input', filterAndRender); 
    
    initializeData();
    filterAndRender(); 
});

declare var Chart: any; 
declare var showdown: any;
declare var html2canvas: any; // Declare html2canvas
// @ts-ignore
declare var jspdf: any; // Declare jspdf global UMD object