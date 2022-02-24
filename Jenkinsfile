// Syntax check with this command line
// curl -k -X POST -F "jenkinsfile=<Jenkinsfile" https://ci.rssw.eu/pipeline-model-converter/validate

pipeline {
  agent { label 'Linux-Office' }
  options {
    disableConcurrentBuilds()
    skipDefaultCheckout()
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }
  stages {
    stage('Checkout') {
      steps {
        checkout([$class: 'GitSCM', branches: scm.branches, extensions: scm.extensions + [[$class: 'CleanCheckout']], userRemoteConfigs: scm.userRemoteConfigs])
      }
    }

    stage('Build') { 
      agent {
        docker {
          image 'node:16'
          args "-v ${tool name: 'SQScanner4', type: 'hudson.plugins.sonar.SonarRunnerInstallation'}:/scanner -e HOME=."
          reuseNode true
        }
      }
      steps {
        copyArtifacts filter: 'bootstrap/target/abl-lsp-bootstrap-1.0.0-SNAPSHOT.jar', fingerprintArtifacts: true, projectName: '/ABLS/develop', selector: lastSuccessful(), target: '.'
        withSonarQubeEnv('RSSW2') {
          sh 'mv bootstrap/target/abl-lsp-bootstrap-1.0.0-SNAPSHOT.jar abl-lsp.jar && node --version && npm install vsce && npm install webpack && npm run webpack && cp node_modules/abl-tmlanguage/abl.tmLanguage.json resources/abl.tmLanguage.json && npm run package'
        }
        archiveArtifacts artifacts: '*.vsix'
      }
    }

    stage('Build Docker Image') {
      steps {
        script {
          docker.withServer('unix:///var/run/docker.sock') {
            sh 'cp *.vsix docker && docker build --no-cache -t rssw/code:latest -f docker/Dockerfile docker'
          }
        }
      }
    }

  }
}